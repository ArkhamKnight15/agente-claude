"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CostCategory, DataProvider, Priority } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { getSource } from "@/server/integrations/sources";
import { enqueueJob } from "@/server/jobs/queue";
import { createCampaign, cancelCampaign, pauseCampaign, startCampaign } from "@/server/services/campaigns";
import {
  approveMessage,
  createOutboundDraft,
  markSentManually,
  queueApiSend,
  rejectMessage,
  retryFailedMessage,
  updateDraft,
} from "@/server/services/messages";
import { upsertLeadFromRaw } from "@/server/services/leads";
import { findCity } from "@/data/locations";
import { customNiche, getNiche, CUSTOM_NICHE_KEY } from "@/data/niches";
import { parseBRL } from "@/lib/format";
import type { RawBusiness } from "@/server/integrations/sources/types";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { bool, optStr, runAction, str, type ActionState } from "./helpers";

// ───────────────────────────── Campanhas ─────────────────────────────

export async function createCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("campaign:write");
    await enforceRateLimit(`campaign:create:${user.id}`, 10, 3600, "Limite de criação de campanhas por hora atingido.");
    const input = z
      .object({
        state: z.string().length(2, "Selecione o estado."),
        city: z.string().min(2, "Selecione a cidade."),
        nicheKey: z.string().min(1, "Selecione o nicho."),
        targetCount: z.coerce.number().int("Use um número inteiro.").min(1, "Mínimo 1.").max(1000),
        minPriority: z.enum(Priority),
        preferredChannel: z.enum(["WHATSAPP", "EMAIL"]),
      })
      .parse({
        state: str(fd, "state"),
        city: str(fd, "city"),
        nicheKey: str(fd, "nicheKey"),
        targetCount: str(fd, "targetCount"),
        minPriority: str(fd, "minPriority") || "MEDIUM",
        preferredChannel: str(fd, "preferredChannel") || "WHATSAPP",
      });
    const providers = fd.getAll("providers").map((p) => z.enum(DataProvider).parse(p));
    const campaign = await createCampaign(
      {
        ...input,
        name: optStr(fd, "name") ?? undefined,
        customTerm: optStr(fd, "customTerm"),
        onlyWithoutWebsite: bool(fd, "onlyWithoutWebsite"),
        abTestEnabled: bool(fd, "abTestEnabled"),
        providers,
      },
      user.id,
      true,
    );
    revalidatePath("/campanhas");
    return { ok: true, message: "Campanha iniciada.", data: { id: campaign.id } };
  });
}

export async function campaignControlAction(campaignId: string, command: "pause" | "resume" | "cancel"): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("campaign:write");
    if (command === "pause") await pauseCampaign(campaignId, user.id);
    else if (command === "resume") await startCampaign(campaignId, user.id);
    else await cancelCampaign(campaignId, user.id);
    revalidatePath(`/campanhas/${campaignId}`);
    revalidatePath("/campanhas");
    const messages = { pause: "Campanha pausada.", resume: "Campanha retomada.", cancel: "Campanha cancelada." };
    return { ok: true, message: messages[command] };
  });
}

// ───────────────────────────── Pesquisa avulsa ─────────────────────────────

export interface SearchResultItem extends RawBusiness {
  existingLeadId: string | null;
}

export async function searchBusinessesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:write");
    await enforceRateLimit(`search:${user.id}`, 30, 3600, "Limite de pesquisas por hora atingido.");
    const state = z.string().length(2, "Selecione o estado.").parse(str(fd, "state"));
    const city = findCity(state, str(fd, "city"));
    if (!city) return { ok: false, error: "Selecione uma cidade válida.", fieldErrors: { city: ["Cidade não encontrada nesta UF."] } };
    const nicheKey = str(fd, "nicheKey");
    const niche = nicheKey === CUSTOM_NICHE_KEY ? customNiche(str(fd, "customTerm") || "comércio") : getNiche(nicheKey);
    if (!niche) return { ok: false, error: "Selecione o nicho.", fieldErrors: { nicheKey: ["Selecione o nicho."] } };
    const provider = z.enum(DataProvider).parse(str(fd, "provider") || "GOOGLE_PLACES");
    const source = getSource(provider);
    if (!source?.isConfigured()) throw new AppError(`${source?.label ?? provider} não está configurado. Veja a página Integrações.`);

    const page = await source.search({
      term: niche.searchTerms[0],
      city: city.name,
      state,
      limit: 20,
      osmTags: niche.osmTags,
      cursor: optStr(fd, "cursor"),
    });
    const items: SearchResultItem[] = [];
    for (const item of page.items) {
      const existing = await db.leadSource.findUnique({
        where: { provider_externalId: { provider: item.provider, externalId: item.externalId } },
        select: { leadId: true },
      });
      items.push({ ...item, existingLeadId: existing?.leadId ?? null });
    }
    return {
      ok: true,
      message: `${items.length} empresa(s) encontrada(s) em ${source.label}.`,
      data: { items, nextCursor: page.nextCursor !== "done" ? page.nextCursor : null, nicheKey: niche.key, nicheLabel: niche.label, city: city.name, state },
    };
  });
}

export async function importBusinessesAction(
  items: RawBusiness[],
  ctx: { nicheKey: string; nicheLabel: string; city: string; state: string },
): Promise<ActionState> {
  return runAction(async () => {
    await requirePermission("lead:write");
    const s = z.string().max(500).nullable();
    const n = z.number().finite().nullable();
    const rawSchema = z.object({
      provider: z.enum(["GOOGLE_PLACES", "OSM"]),
      externalId: z.string().min(1).max(300),
      name: z.string().min(1).max(200),
      sourceUrl: s, category: s, address: s, neighborhood: s, city: s, state: s, postalCode: s,
      latitude: n, longitude: n, phone: s, whatsapp: s, email: s, website: s, instagram: s, facebook: s,
      googleMapsUrl: s, businessStatus: s, rating: n, reviewCount: n, hasWebsiteField: z.boolean(),
    });
    const parsed = z.array(rawSchema).max(60).parse(items.map(({ ...item }) => { delete (item as Partial<SearchResultItem>).existingLeadId; return item; }));
    let created = 0;
    let merged = 0;
    for (const raw of parsed) {
      const result = await upsertLeadFromRaw(raw, { nicheKey: ctx.nicheKey, nicheLabel: ctx.nicheLabel, fallbackCity: ctx.city, fallbackState: ctx.state });
      if (result.created) created++;
      else merged++;
      await enqueueJob("lead.process", { leadId: result.leadId }, { leadId: result.leadId, idempotencyKey: `lead.process:import:${result.leadId}` });
    }
    revalidatePath("/leads");
    return { ok: true, message: `${created} lead(s) importado(s), ${merged} já existente(s). Verificação de site agendada.` };
  });
}

// ───────────────────────────── Mensagens ─────────────────────────────

const revalidateMessages = (leadId?: string) => {
  revalidatePath("/mensagens");
  if (leadId) revalidatePath(`/leads/${leadId}`);
};

export async function saveDraftAction(messageId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("message:write");
    const body = z.string().min(10, "Mensagem muito curta.").max(4000).parse(str(fd, "body"));
    const message = await updateDraft(messageId, { body, subject: optStr(fd, "subject") }, user.id);
    revalidateMessages(message.leadId);
    return { ok: true, message: "Rascunho salvo. Revise e aprove novamente." };
  });
}

export async function messageCommandAction(
  messageId: string,
  command: "approve" | "approve_send" | "send_api" | "mark_sent" | "reject" | "retry",
  reason?: string,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission(command === "reject" ? "message:write" : command === "approve" ? "message:approve" : "message:send");
    const message = await db.message.findUnique({ where: { id: messageId }, select: { leadId: true } });
    let text = "";
    switch (command) {
      case "approve":
        await approveMessage(messageId, user.id);
        text = "Mensagem aprovada.";
        break;
      case "approve_send": {
        await approveMessage(messageId, user.id);
        const { scheduledFor } = await queueApiSend(messageId, user.id);
        text = scheduledFor ? `Aprovada e agendada para ${scheduledFor.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (janela de envio).` : "Aprovada e colocada na fila de envio.";
        break;
      }
      case "send_api": {
        const { scheduledFor } = await queueApiSend(messageId, user.id);
        text = scheduledFor ? "Agendada para a próxima janela de envio." : "Mensagem na fila de envio.";
        break;
      }
      case "mark_sent":
        await markSentManually(messageId, user.id);
        text = "Envio manual registrado.";
        break;
      case "reject":
        await rejectMessage(messageId, reason ?? "", user.id);
        text = "Mensagem rejeitada.";
        break;
      case "retry":
        await retryFailedMessage(messageId, user.id);
        text = "Reenvio agendado.";
        break;
    }
    revalidateMessages(message?.leadId);
    return { ok: true, message: text };
  });
}

export async function bulkApproveAction(ids: string[]): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("message:approve");
    let ok = 0;
    const errors: string[] = [];
    for (const id of ids.slice(0, 50)) {
      try {
        await approveMessage(id, user.id);
        ok++;
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
    revalidateMessages();
    return errors.length
      ? { ok: ok > 0, message: `${ok} aprovada(s); ${errors.length} com bloqueio: ${errors[0]}`, error: ok === 0 ? errors[0] : undefined }
      : { ok: true, message: `${ok} mensagem(ns) aprovada(s).` };
  });
}

export async function replyDraftAction(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("message:write");
    const channel = z.enum(["WHATSAPP", "EMAIL"]).parse(str(fd, "channel"));
    const body = z.string().min(2, "Escreva a resposta.").max(4000).parse(str(fd, "body"));
    await createOutboundDraft({ leadId, channel, purpose: "REPLY", body, subject: optStr(fd, "subject"), userId: user.id, inReplyToId: optStr(fd, "inReplyToId") });
    revalidateMessages(leadId);
    return { ok: true, message: "Resposta criada como rascunho — aprove para enviar." };
  });
}

// ───────────────────────────── Custos ─────────────────────────────

export async function addCostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("cost:write");
    const data = z
      .object({ description: z.string().min(2, "Descreva o custo."), category: z.enum(CostCategory), date: z.string().min(1, "Informe a data.") })
      .parse({ description: str(fd, "description"), category: str(fd, "category") || "OTHER", date: str(fd, "date") });
    const amount = parseBRL(str(fd, "amount"));
    if (!amount || amount <= 0) return { ok: false, error: "Informe um valor válido.", fieldErrors: { amount: ["Valor inválido."] } };
    await db.cost.create({ data: { ...data, amount, date: new Date(`${data.date}T12:00:00-03:00`), createdById: user.id } });
    revalidatePath("/configuracoes/dados");
    return { ok: true, message: "Custo registrado." };
  });
}

export async function deleteCostAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    await requirePermission("cost:write");
    await db.cost.delete({ where: { id } });
    revalidatePath("/configuracoes/dados");
    return { ok: true, message: "Custo removido." };
  });
}
