import type { Campaign, Prisma } from "@/generated/prisma/client";
import type { Channel, DataProvider, Priority } from "@/generated/prisma/enums";
import { findCity, isValidUf } from "@/data/locations";
import { CUSTOM_NICHE_KEY, customNiche, getNiche } from "@/data/niches";
import { normalizeText } from "@/lib/text";
import { rate } from "@/lib/stats";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { getSource } from "@/server/integrations/sources";
import { cancelQueuedCampaignJobs, enqueueJob } from "@/server/jobs/queue";
import { audit } from "@/server/security/audit";
import { logEvent } from "@/server/services/events";
import { getContactPolicy } from "@/server/services/settings";

export interface CampaignProgress {
  run: number;
  searchDone: boolean;
  providerIndex: number;
  termIndex: number;
  cursor: string | null;
  found: number;
  linked: number;
  created: number;
  duplicates: number;
  outsideArea: number;
  apiRequests: number;
  skippedProviders: string[];
  warnings: string[];
}

export const EMPTY_PROGRESS: CampaignProgress = {
  run: 0,
  searchDone: false,
  providerIndex: 0,
  termIndex: 0,
  cursor: null,
  found: 0,
  linked: 0,
  created: 0,
  duplicates: 0,
  outsideArea: 0,
  apiRequests: 0,
  skippedProviders: [],
  warnings: [],
};

export function readProgress(campaign: Pick<Campaign, "progress">): CampaignProgress {
  return { ...EMPTY_PROGRESS, ...((campaign.progress ?? {}) as Partial<CampaignProgress>) };
}

export interface CampaignInput {
  name?: string;
  state: string;
  city: string;
  nicheKey: string;
  customTerm?: string | null;
  targetCount: number;
  minPriority: Priority;
  onlyWithoutWebsite: boolean;
  providers: DataProvider[];
  preferredChannel: Channel;
  abTestEnabled: boolean;
}

export async function createCampaign(input: CampaignInput, userId: string, start = true): Promise<Campaign> {
  if (!isValidUf(input.state)) throw new AppError("Estado inválido.");
  const city = findCity(input.state, input.city);
  if (!city) throw new AppError("Município não encontrado nesta UF (use a lista oficial do IBGE).");

  const niche =
    input.nicheKey === CUSTOM_NICHE_KEY
      ? input.customTerm?.trim()
        ? customNiche(input.customTerm.trim())
        : null
      : getNiche(input.nicheKey);
  if (!niche) throw new AppError("Escolha um nicho ou informe o termo de busca personalizado.");

  const policy = await getContactPolicy();
  if (input.targetCount < 1 || input.targetCount > policy.maxLeadsPerCampaign) {
    throw new AppError(`A quantidade deve estar entre 1 e ${policy.maxLeadsPerCampaign} (limite configurado).`);
  }
  const providers = [...new Set(input.providers)].filter((p) => getSource(p));
  if (providers.length === 0) throw new AppError("Selecione ao menos uma fonte de dados.");
  const configured = providers.filter((p) => getSource(p)!.isConfigured());
  if (configured.length === 0) {
    throw new AppError("Nenhuma das fontes selecionadas está configurada. Veja a página Integrações.");
  }

  const campaign = await db.campaign.create({
    data: {
      name: input.name?.trim() || `${niche.label} — ${city.name}/${input.state}`,
      state: input.state,
      city: city.name,
      cityNormalized: normalizeText(city.name),
      nicheKey: niche.key,
      nicheLabel: niche.label,
      searchTerms: niche.searchTerms,
      targetCount: input.targetCount,
      minPriority: input.minPriority,
      onlyWithoutWebsite: input.onlyWithoutWebsite,
      providers: configured,
      preferredChannel: input.preferredChannel,
      abTestEnabled: input.abTestEnabled,
      status: "DRAFT",
      progress: EMPTY_PROGRESS as unknown as Prisma.InputJsonValue,
      createdById: userId,
    },
  });
  await audit({ userId, action: "campaign.create", entityType: "Campaign", entityId: campaign.id, metadata: { targetCount: input.targetCount } });
  if (start) return startCampaign(campaign.id, userId);
  return campaign;
}

export async function startCampaign(id: string, userId: string | null): Promise<Campaign> {
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  if (!["DRAFT", "PAUSED", "FAILED"].includes(campaign.status)) {
    throw new AppError("A campanha já está em execução ou foi encerrada.");
  }
  const progress = readProgress(campaign);
  progress.run += 1;
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.campaign.update({
      where: { id },
      data: {
        status: "RUNNING",
        startedAt: campaign.startedAt ?? new Date(),
        pausedAt: null,
        lastError: null,
        progress: progress as unknown as Prisma.InputJsonValue,
      },
    });
    // Retoma os jobs que falharam por indisponibilidade durante a execução anterior.
    await tx.job.updateMany({
      where: { campaignId: id, status: "FAILED", type: "lead.process" },
      data: { status: "QUEUED", runAt: new Date(), lastError: null, maxAttempts: { increment: 1 } },
    });
    if (!progress.searchDone) {
      await enqueueJob("campaign.search", { campaignId: id }, { campaignId: id, idempotencyKey: `campaign.search:${id}:${progress.run}`, priority: 2 }, tx);
    }
    await enqueueJob(
      "campaign.finalize",
      { campaignId: id },
      { campaignId: id, idempotencyKey: `campaign.finalize:${id}:${progress.run}`, runAt: new Date(Date.now() + 15_000), maxAttempts: 200 },
      tx,
    );
    return row;
  });
  await audit({ userId, action: campaign.status === "DRAFT" ? "campaign.start" : "campaign.resume", entityType: "Campaign", entityId: id });
  await logEvent({ source: "campaign", message: `Campanha “${campaign.name}” ${campaign.status === "DRAFT" ? "iniciada" : "retomada"}.`, campaignId: id });
  return updated;
}

export async function pauseCampaign(id: string, userId: string | null, reason?: string): Promise<void> {
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  if (campaign.status !== "RUNNING") throw new AppError("Só campanhas em execução podem ser pausadas.");
  await db.campaign.update({ where: { id }, data: { status: "PAUSED", pausedAt: new Date(), lastError: reason ?? null } });
  await audit({ userId, action: "campaign.pause", entityType: "Campaign", entityId: id, metadata: reason ? { reason } : undefined });
  await logEvent({ level: reason ? "WARN" : "INFO", source: "campaign", message: `Campanha pausada${reason ? `: ${reason}` : " pelo usuário"}.`, campaignId: id });
}

export async function cancelCampaign(id: string, userId: string): Promise<void> {
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  if (["CANCELLED", "COMPLETED"].includes(campaign.status)) throw new AppError("A campanha já foi encerrada.");
  await db.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await cancelQueuedCampaignJobs(id, tx);
    await tx.message.updateMany({
      where: { campaignId: id, direction: "OUTBOUND", status: { in: ["PENDING_APPROVAL", "APPROVED", "QUEUED"] } },
      data: { status: "CANCELLED", error: "Campanha cancelada." },
    });
  });
  await audit({ userId, action: "campaign.cancel", entityType: "Campaign", entityId: id });
  await logEvent({ source: "campaign", message: `Campanha “${campaign.name}” cancelada.`, campaignId: id });
}

export async function listCampaigns(page = 1, pageSize = 20) {
  const [total, items] = await db.$transaction([
    db.campaign.count(),
    db.campaign.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { leads: true, messages: true } }, createdBy: { select: { name: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface CampaignReport {
  generatedAt: string;
  leads: number;
  newLeads: number;
  website: Record<string, number>;
  priority: Record<string, number>;
  pipeline: Record<string, number>;
  messagesDrafted: number;
  messagesSent: number;
  messagesFailed: number;
  replies: number;
  interested: number;
  optOuts: number;
  proposals: number;
  won: number;
  revenue: number;
  responseRate: number | null;
  conversionRate: number | null;
  jobs: Record<string, number>;
}

export async function computeCampaignReport(campaignId: string): Promise<CampaignReport> {
  const leadWhere = { campaignLeads: { some: { campaignId } } };
  const [leads, newLeads, website, priority, pipeline, drafted, sent, failed, inbound, interested, optOuts, proposals, wonAgg, jobs, contactedLeads, repliedLeads] =
    await Promise.all([
      db.campaignLead.count({ where: { campaignId } }),
      db.campaignLead.count({ where: { campaignId, isNew: true } }),
      db.lead.groupBy({ by: ["websiteStatus"], where: leadWhere, _count: true }),
      db.lead.groupBy({ by: ["priority"], where: leadWhere, _count: true }),
      db.campaignLead.groupBy({ by: ["status"], where: { campaignId }, _count: true }),
      db.message.count({ where: { campaignId, direction: "OUTBOUND" } }),
      db.message.count({ where: { campaignId, direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED", "READ"] } } }),
      db.message.count({ where: { campaignId, direction: "OUTBOUND", status: "FAILED" } }),
      db.message.count({ where: { campaignId, direction: "INBOUND" } }),
      db.message.count({ where: { campaignId, direction: "INBOUND", classification: { in: ["INTERESTED", "QUESTION"] } } }),
      db.message.count({ where: { campaignId, direction: "INBOUND", classification: "OPT_OUT" } }),
      db.proposal.count({ where: { lead: leadWhere, status: { in: ["SENT", "ACCEPTED", "REJECTED", "EXPIRED"] } } }),
      db.lead.aggregate({ where: { ...leadWhere, stage: "WON" }, _count: true, _sum: { dealValue: true } }),
      db.job.groupBy({ by: ["status"], where: { campaignId }, _count: true }),
      db.lead.count({ where: { ...leadWhere, messages: { some: { campaignId, direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED", "READ"] } } } } }),
      db.lead.count({ where: { ...leadWhere, messages: { some: { campaignId, direction: "INBOUND" } } } }),
    ]);
  const toRecord = <T extends string | null>(rows: Array<{ _count: number } & Record<string, unknown>>, key: string) =>
    Object.fromEntries(rows.map((r) => [String((r[key] as T) ?? "NONE"), r._count]));
  return {
    generatedAt: new Date().toISOString(),
    leads,
    newLeads,
    website: toRecord(website, "websiteStatus"),
    priority: toRecord(priority, "priority"),
    pipeline: toRecord(pipeline, "status"),
    messagesDrafted: drafted,
    messagesSent: sent,
    messagesFailed: failed,
    replies: inbound,
    interested,
    optOuts,
    proposals,
    won: wonAgg._count,
    revenue: Number(wonAgg._sum.dealValue ?? 0),
    responseRate: rate(repliedLeads, contactedLeads),
    conversionRate: rate(wonAgg._count, contactedLeads),
    jobs: toRecord(jobs, "status"),
  };
}

export async function getCampaignDetail(id: string) {
  const campaign = await db.campaign.findUnique({ where: { id }, include: { createdBy: { select: { name: true } } } });
  if (!campaign) throw new NotFoundError("Campanha não encontrada.");
  const [report, recentEvents] = await Promise.all([
    computeCampaignReport(id),
    db.eventLog.findMany({ where: { campaignId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return { campaign, progress: readProgress(campaign), report, recentEvents };
}
