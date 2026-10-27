import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { logEvent } from "@/server/services/events";
import { changeLeadStage, createTask } from "@/server/services/leads";
import { getContactPolicy } from "@/server/services/settings";

const DAY = 86400_000;

/**
 * Etapa 12: preparar as próximas ações. Move leads sem resposta para "Aguardando resposta",
 * agenda acompanhamentos (sem enviar nada automaticamente) e expira propostas vencidas.
 */
export async function handleFollowupsScan(): Promise<Prisma.InputJsonValue> {
  const policy = await getContactPolicy();
  const now = Date.now();

  const contacted = await db.lead.findMany({
    where: { stage: "CONTACTED", lastContactAt: { lt: new Date(now - DAY) } },
    select: { id: true, lastContactAt: true, lastReplyAt: true },
    take: 500,
  });
  let awaiting = 0;
  for (const lead of contacted) {
    if (lead.lastReplyAt && lead.lastContactAt && lead.lastReplyAt > lead.lastContactAt) continue;
    await changeLeadStage(lead.id, "AWAITING_REPLY", { actorType: "SYSTEM" });
    awaiting++;
  }

  const waiting = await db.lead.findMany({
    where: {
      stage: "AWAITING_REPLY",
      doNotContact: false,
      lastContactAt: { lt: new Date(now - policy.followUpAfterDays * DAY) },
      tasks: { none: { status: "OPEN" } },
    },
    select: {
      id: true,
      name: true,
      lastReplyAt: true,
      lastContactAt: true,
      messages: { where: { direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED", "READ"] } }, select: { sentAt: true } },
    },
    take: 500,
  });
  let followUps = 0;
  let closeSuggestions = 0;
  for (const lead of waiting) {
    const since = lead.lastReplyAt?.getTime() ?? 0;
    const unanswered = lead.messages.filter((m) => (m.sentAt?.getTime() ?? 0) > since).length;
    if (unanswered < policy.maxUnansweredMessages) {
      await createTask(lead.id, { title: `Fazer acompanhamento com ${lead.name}`, type: "FOLLOW_UP", dueAt: new Date(), auto: true });
      followUps++;
    } else {
      await createTask(
        lead.id,
        { title: `Sem resposta após ${unanswered} contato(s): encerrar como “Sem interesse”?`, type: "OTHER", dueAt: new Date(), auto: true },
      );
      closeSuggestions++;
    }
  }

  const expired = await db.proposal.updateMany({
    where: { status: { in: ["SENT", "APPROVED"] }, validUntil: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });

  if (awaiting || followUps || closeSuggestions || expired.count) {
    await logEvent({
      source: "followups.scan",
      message: `${awaiting} lead(s) aguardando resposta, ${followUps} acompanhamento(s) agendado(s), ${closeSuggestions} sugestão(ões) de encerramento, ${expired.count} proposta(s) expirada(s).`,
    });
  }
  return { awaiting, followUps, closeSuggestions, expiredProposals: expired.count };
}

/** Limpeza diária: sessões expiradas, logs antigos e retenção de leads nunca contatados (LGPD). */
export async function handleMaintenanceCleanup(): Promise<Prisma.InputJsonValue> {
  const policy = await getContactPolicy();
  const now = Date.now();
  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const buckets = await db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(now - DAY) } } });
  const events = await db.eventLog.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * DAY) } } });
  const webhooks = await db.webhookEvent.deleteMany({ where: { receivedAt: { lt: new Date(now - 30 * DAY) } } });
  const jobs = await db.job.deleteMany({
    where: { status: { in: ["SUCCEEDED", "CANCELLED"] }, finishedAt: { lt: new Date(now - 30 * DAY) } },
  });

  let retained = 0;
  if (policy.retentionDaysUncontacted > 0) {
    const result = await db.lead.deleteMany({
      where: {
        createdAt: { lt: new Date(now - policy.retentionDaysUncontacted * DAY) },
        stage: { in: ["FOUND", "VERIFYING", "QUALIFIED", "MESSAGE_READY"] },
        lastContactAt: null,
        messages: { none: { status: { in: ["SENT", "DELIVERED", "READ", "RECEIVED"] } } },
        proposals: { none: {} },
        isDemo: false,
      },
    });
    retained = result.count;
  }
  if (retained) {
    await logEvent({ source: "maintenance", message: `${retained} lead(s) nunca contatados removidos pela política de retenção (${policy.retentionDaysUncontacted} dias).` });
  }
  return { sessions: sessions.count, buckets: buckets.count, events: events.count, webhooks: webhooks.count, jobs: jobs.count, retainedLeadsRemoved: retained };
}
