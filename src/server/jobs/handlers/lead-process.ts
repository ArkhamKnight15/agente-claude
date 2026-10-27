import type { Job, Prisma } from "@/generated/prisma/client";
import { PRIORITY_RANK } from "@/data/labels";
import { db } from "@/server/db";
import { errorMessage } from "@/server/errors";
import { availableChannels, draftInitialMessage, scoreLead } from "@/server/agent/lead-agent";
import { verifyLeadWebsite } from "@/server/agent/website-verifier";
import { changeLeadStage } from "@/server/services/leads";
import { approveMessage, queueApiSend } from "@/server/services/messages";
import { getAgentSettings, getContactPolicy } from "@/server/services/settings";
import { isSuppressed } from "@/server/services/suppression";
import { logEvent } from "@/server/services/events";

/**
 * Etapas 3, 5, 6 e 7: verificar site, qualificar, gerar a mensagem e colocá-la na fila de
 * revisão. Cada etapa concluída é gravada em CampaignLead.status, então uma retentativa
 * pula o que já foi feito.
 */

const REVERIFY_AFTER_DAYS = 30;
const CONTACTED_STAGES = ["CONTACTED", "AWAITING_REPLY", "INTERESTED", "NEGOTIATION", "PROPOSAL_SENT", "WON", "LOST", "DO_NOT_CONTACT"];

export async function handleLeadProcess(job: Job): Promise<Prisma.InputJsonValue> {
  const { campaignId, leadId, force } = job.payload as { campaignId?: string; leadId: string; force?: boolean };
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { skipped: "lead removido" };
  const campaign = campaignId ? await db.campaign.findUnique({ where: { id: campaignId } }) : null;
  const link = campaignId ? await db.campaignLead.findUnique({ where: { campaignId_leadId: { campaignId, leadId } } }) : null;

  const setLink = async (data: Prisma.CampaignLeadUpdateInput) => {
    if (campaignId) await db.campaignLead.update({ where: { campaignId_leadId: { campaignId, leadId } }, data });
  };

  // Evita abordar de novo quem já está em negociação ou pediu para não ser contatado.
  if (!force && (lead.doNotContact || CONTACTED_STAGES.includes(lead.stage))) {
    await setLink({ status: "SKIPPED", skipReason: lead.doNotContact ? "Não contatar novamente." : "Lead já contatado anteriormente." });
    return { skipped: "já contatado" };
  }

  try {
    // 1) Verificação de site.
    const recentlyChecked =
      lead.websiteCheckedAt && Date.now() - lead.websiteCheckedAt.getTime() < REVERIFY_AFTER_DAYS * 86400_000 && lead.websiteStatus !== "INCONCLUSIVE";
    if (force || !link || link.status === "PENDING") {
      if (force || !recentlyChecked) {
        if (lead.stage === "FOUND") await changeLeadStage(leadId, "VERIFYING", { actorType: "AGENT" });
        await verifyLeadWebsite(leadId);
      }
      await setLink({ status: "VERIFIED" });
    }

    // 2) Qualificação.
    const score = await scoreLead(leadId);
    await setLink({ status: "SCORED" });
    const fresh = await db.lead.findUniqueOrThrow({ where: { id: leadId } });

    const minPriority = campaign?.minPriority ?? "MEDIUM";
    const meetsPriority = PRIORITY_RANK[score.priority] >= PRIORITY_RANK[minPriority];
    const websiteOk =
      !campaign?.onlyWithoutWebsite ||
      ["NO_WEBSITE_CONFIRMED", "NO_WEBSITE_LIKELY", "WEBSITE_WITH_ISSUES"].includes(fresh.websiteStatus);
    const qualified = meetsPriority && websiteOk && !score.disqualified;

    if (!qualified) {
      if (fresh.stage === "VERIFYING") await changeLeadStage(leadId, "FOUND", { actorType: "AGENT", note: "Não atingiu os critérios de qualificação." });
      const reason = score.disqualified
        ? score.caps.join(" ")
        : !websiteOk
          ? "Possui site (campanha filtra empresas sem site ou com presença fraca)."
          : `Prioridade ${score.priority === "LOW" ? "baixa" : "média"} abaixo do mínimo da campanha.`;
      await setLink({ status: "SKIPPED", skipReason: reason });
      return { qualified: false, score: score.score, reason };
    }
    if (["FOUND", "VERIFYING"].includes(fresh.stage)) await changeLeadStage(leadId, "QUALIFIED", { actorType: "AGENT" });

    // 3) Mensagem personalizada para revisão.
    const settings = await getAgentSettings();
    if (!settings.autoGenerateMessages) {
      return { qualified: true, score: score.score, message: "geração automática desativada" };
    }
    if (availableChannels(fresh).length === 0) {
      await setLink({ status: "SKIPPED", skipReason: "Sem canal de contato público." });
      return { qualified: true, score: score.score, message: "sem canal" };
    }
    if (await isSuppressed(fresh)) {
      await setLink({ status: "SKIPPED", skipReason: "Contato na lista de supressão." });
      return { qualified: true, message: "suprimido" };
    }
    const message = await draftInitialMessage(leadId, {
      campaignId: campaignId ?? null,
      preferredChannel: campaign?.preferredChannel,
      abTest: campaign?.abTestEnabled,
    });
    await setLink({ status: "MESSAGE_DRAFTED", error: null });

    // Aprovação automática só para e-mail, se o usuário habilitou e reconheceu as regras.
    const policy = await getContactPolicy();
    if (policy.approvalMode === "AUTO_EMAIL" && policy.autoApprovalAcknowledged && message.channel === "EMAIL" && campaign?.createdById) {
      try {
        await approveMessage(message.id, campaign.createdById);
        await queueApiSend(message.id, campaign.createdById);
      } catch (error) {
        await logEvent({ level: "WARN", source: "lead.process", message: `Aprovação automática não aplicada: ${errorMessage(error)}`, leadId, campaignId });
      }
    }
    return { qualified: true, score: score.score, messageId: message.id };
  } catch (error) {
    await setLink({ error: errorMessage(error).slice(0, 500) });
    throw error;
  }
}
