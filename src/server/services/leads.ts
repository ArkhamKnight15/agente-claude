import type { Lead, Prisma } from "@/generated/prisma/client";
import type { LeadStage, LossReason, Priority, WebsiteStatus } from "@/generated/prisma/enums";
import { findDuplicate, websiteDomain, type DuplicateReason } from "@/lib/agent/dedupe";
import { normalizeBrazilPhone, onlyDigits } from "@/lib/phone";
import { nameTokens, normalizeBusinessName, normalizeText } from "@/lib/text";
import { classifyUrl, normalizeWebsiteUrl } from "@/lib/url";
import { STAGE_LABELS, LOSS_REASON_LABELS } from "@/data/labels";
import { findCity } from "@/data/locations";
import { db, type Tx } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import type { RawBusiness } from "@/server/integrations/sources/types";
import { audit } from "@/server/security/audit";
import { recordActivity } from "@/server/services/activity";
import { addSuppression, isSuppressed } from "@/server/services/suppression";

// ───────────────────────────── Importação e deduplicação ─────────────────────────────

export interface UpsertResult {
  leadId: string;
  created: boolean;
  duplicateReason: DuplicateReason | "source" | null;
}

interface UpsertContext {
  nicheKey: string | null;
  nicheLabel: string;
  fallbackCity: string;
  fallbackState: string;
  isDemo?: boolean;
}

function profilesFromRaw(raw: RawBusiness) {
  let websiteUrl: string | null = null;
  let instagramUrl = raw.instagram;
  let facebookUrl = raw.facebook;
  const otherProfiles: Array<{ label: string; url: string }> = [];
  const website = normalizeWebsiteUrl(raw.website);
  if (website) {
    const kind = classifyUrl(website);
    if (kind?.kind === "own_domain" || kind?.kind === "free_builder") websiteUrl = website;
    else if (kind?.label === "Instagram") instagramUrl ??= website;
    else if (kind?.label === "Facebook") facebookUrl ??= website;
    else if (kind) otherProfiles.push({ label: kind.label, url: website });
  }
  return { websiteUrl, instagramUrl, facebookUrl, otherProfiles };
}

/** Campos mínimos guardados da fonte (sem dados sensíveis), usados como evidência. */
function sourceSnapshot(raw: RawBusiness): Prisma.InputJsonValue {
  return {
    website: raw.website,
    hasWebsiteField: raw.hasWebsiteField,
    category: raw.category,
    businessStatus: raw.businessStatus,
    rating: raw.rating,
    reviewCount: raw.reviewCount,
  };
}

export async function upsertLeadFromRaw(raw: RawBusiness, ctx: UpsertContext): Promise<UpsertResult> {
  const now = new Date();
  const existingSource = await db.leadSource.findUnique({
    where: { provider_externalId: { provider: raw.provider, externalId: raw.externalId } },
  });
  if (existingSource) {
    await db.$transaction([
      db.leadSource.update({ where: { id: existingSource.id }, data: { fetchedAt: now, data: sourceSnapshot(raw) } }),
      db.lead.update({
        where: { id: existingSource.leadId },
        data: {
          lastVerifiedAt: now,
          ...(raw.rating !== null ? { rating: raw.rating } : {}),
          ...(raw.reviewCount !== null ? { reviewCount: raw.reviewCount } : {}),
          ...(raw.businessStatus ? { businessStatus: raw.businessStatus } : {}),
        },
      }),
    ]);
    return { leadId: existingSource.leadId, created: false, duplicateReason: "source" };
  }

  const phone = normalizeBrazilPhone(raw.phone);
  const whatsapp = normalizeBrazilPhone(raw.whatsapp);
  const state = (raw.state ?? ctx.fallbackState).toUpperCase().slice(0, 2);
  const cityName = findCity(state, raw.city ?? ctx.fallbackCity)?.name ?? raw.city ?? ctx.fallbackCity;
  const cityNormalized = normalizeText(cityName);
  const profiles = profilesFromRaw(raw);
  const domain = websiteDomain(profiles.websiteUrl);
  const tokens = nameTokens(raw.name).sort((a, b) => b.length - a.length).slice(0, 3);

  const candidates = await db.lead.findMany({
    where: {
      OR: [
        ...(phone ? [{ phoneE164: phone.e164 }] : []),
        ...(domain ? [{ websiteUrl: { contains: domain } }] : []),
        ...tokens.map((t) => ({ state, cityNormalized, normalizedName: { contains: t } })),
      ],
    },
    select: {
      id: true,
      normalizedName: true,
      cityNormalized: true,
      state: true,
      phoneE164: true,
      websiteUrl: true,
      latitude: true,
      longitude: true,
    },
    take: 60,
  });

  const duplicate = candidates.length
    ? findDuplicate(
        {
          name: raw.name,
          city: cityName,
          state,
          phoneE164: phone?.e164 ?? null,
          websiteUrl: profiles.websiteUrl,
          latitude: raw.latitude,
          longitude: raw.longitude,
        },
        candidates,
      )
    : null;

  if (duplicate) {
    const existing = await db.lead.findUniqueOrThrow({ where: { id: duplicate.id } });
    // Completa apenas campos vazios: nunca sobrescreve dados editados pelo usuário.
    const fill: Prisma.LeadUpdateInput = {};
    if (!existing.phoneE164 && phone) Object.assign(fill, { phone: phone.national, phoneE164: phone.e164, phoneType: phone.type });
    if (!existing.whatsappE164 && whatsapp) Object.assign(fill, { whatsappE164: whatsapp.e164, whatsappSource: raw.provider });
    if (!existing.email && raw.email) Object.assign(fill, { email: raw.email.toLowerCase(), emailSource: raw.provider });
    if (!existing.instagramUrl && profiles.instagramUrl) fill.instagramUrl = profiles.instagramUrl;
    if (!existing.facebookUrl && profiles.facebookUrl) fill.facebookUrl = profiles.facebookUrl;
    if (!existing.websiteUrl && profiles.websiteUrl) fill.websiteUrl = profiles.websiteUrl;
    if (!existing.googleMapsUrl && raw.googleMapsUrl) fill.googleMapsUrl = raw.googleMapsUrl;
    if (!existing.address && raw.address) fill.address = raw.address;
    if (existing.rating === null && raw.rating !== null) fill.rating = raw.rating;
    if (existing.reviewCount === null && raw.reviewCount !== null) fill.reviewCount = raw.reviewCount;
    if (!existing.businessStatus && raw.businessStatus) fill.businessStatus = raw.businessStatus;
    await db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: existing.id }, data: { ...fill, lastVerifiedAt: now } });
      await tx.leadSource.create({
        data: { leadId: existing.id, provider: raw.provider, externalId: raw.externalId, url: raw.sourceUrl, data: sourceSnapshot(raw) },
      });
      await recordActivity(
        {
          leadId: existing.id,
          type: "LEAD_MERGED",
          description: `Dados combinados com registro de ${raw.provider === "OSM" ? "OpenStreetMap" : "Google Places"} (mesmo ${
            duplicate.reason === "phone" ? "telefone" : duplicate.reason === "website" ? "site" : "nome e local"
          }).`,
        },
        tx,
      );
    });
    return { leadId: existing.id, created: false, duplicateReason: duplicate.reason };
  }

  const lead = await db.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        name: raw.name,
        normalizedName: normalizeBusinessName(raw.name),
        category: raw.category ?? ctx.nicheLabel,
        nicheKey: ctx.nicheKey,
        address: raw.address,
        neighborhood: raw.neighborhood,
        city: cityName,
        cityNormalized,
        state,
        postalCode: raw.postalCode,
        latitude: raw.latitude,
        longitude: raw.longitude,
        phone: phone?.national ?? null,
        phoneE164: phone?.e164 ?? null,
        phoneType: phone?.type ?? null,
        whatsappE164: whatsapp?.e164 ?? null,
        whatsappSource: whatsapp ? raw.provider : null,
        email: raw.email?.toLowerCase() ?? null,
        emailSource: raw.email ? raw.provider : null,
        instagramUrl: profiles.instagramUrl,
        facebookUrl: profiles.facebookUrl,
        otherProfiles: profiles.otherProfiles.length ? profiles.otherProfiles : undefined,
        googleMapsUrl: raw.googleMapsUrl,
        websiteUrl: profiles.websiteUrl,
        businessStatus: raw.businessStatus,
        rating: raw.rating,
        reviewCount: raw.reviewCount,
        primarySource: raw.provider,
        lastVerifiedAt: now,
        isDemo: ctx.isDemo ?? false,
        sources: {
          create: { provider: raw.provider, externalId: raw.externalId, url: raw.sourceUrl, data: sourceSnapshot(raw) },
        },
      },
    });
    await recordActivity(
      { leadId: created.id, type: "LEAD_CREATED", description: `Empresa encontrada via ${raw.provider === "OSM" ? "OpenStreetMap" : "Google Places"}.` },
      tx,
    );
    return created;
  });
  return { leadId: lead.id, created: true, duplicateReason: null };
}

// ───────────────────────────── Consulta ─────────────────────────────

export interface LeadFilters {
  q?: string;
  state?: string;
  city?: string;
  niche?: string;
  priority?: Priority;
  stage?: LeadStage;
  websiteStatus?: WebsiteStatus;
  campaignId?: string;
  page?: number;
  pageSize?: number;
  sort?: "score" | "recent" | "name" | "lastContact";
}

export function buildLeadWhere(f: LeadFilters): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];
  if (f.q?.trim()) {
    const q = f.q.trim();
    const digits = onlyDigits(q);
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { normalizedName: { contains: normalizeText(q) } },
        { email: { contains: q.toLowerCase() } },
        ...(digits.length >= 4 ? [{ phoneE164: { contains: digits } }, { whatsappE164: { contains: digits } }] : []),
      ],
    });
  }
  if (f.state) and.push({ state: f.state });
  if (f.city) and.push({ cityNormalized: normalizeText(f.city) });
  if (f.niche) and.push({ nicheKey: f.niche });
  if (f.priority) and.push({ priority: f.priority });
  if (f.stage) and.push({ stage: f.stage });
  if (f.websiteStatus) and.push({ websiteStatus: f.websiteStatus });
  if (f.campaignId) and.push({ campaignLeads: { some: { campaignId: f.campaignId } } });
  return and.length ? { AND: and } : {};
}

const ORDER: Record<NonNullable<LeadFilters["sort"]>, Prisma.LeadOrderByWithRelationInput[]> = {
  score: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  recent: [{ createdAt: "desc" }],
  name: [{ name: "asc" }],
  lastContact: [{ lastContactAt: { sort: "desc", nulls: "last" } }],
};

export async function listLeads(filters: LeadFilters) {
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));
  const page = Math.max(1, filters.page ?? 1);
  const where = buildLeadWhere(filters);
  const [total, items] = await db.$transaction([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      orderBy: ORDER[filters.sort ?? "score"],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getLeadDetail(id: string) {
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      sources: { orderBy: { fetchedAt: "desc" } },
      websiteChecks: { orderBy: { checkedAt: "desc" }, take: 5 },
      messages: { orderBy: { createdAt: "asc" }, include: { approvedBy: { select: { name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 80 },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }] },
      proposals: { orderBy: { createdAt: "desc" } },
      campaignLeads: { include: { campaign: { select: { id: true, name: true } } } },
    },
  });
  if (!lead) throw new NotFoundError("Lead não encontrado.");
  return lead;
}

export type LeadDetail = Awaited<ReturnType<typeof getLeadDetail>>;

// ───────────────────────────── Edição ─────────────────────────────

export interface LeadEditInput {
  name: string;
  category: string | null;
  nicheKey: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
}

export async function updateLead(id: string, input: LeadEditInput, userId: string): Promise<Lead> {
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) throw new NotFoundError("Lead não encontrado.");
  const phone = input.phone ? normalizeBrazilPhone(input.phone) : null;
  if (input.phone && !phone) throw new AppError("Telefone inválido. Use DDD + número.");
  const whatsapp = input.whatsapp ? normalizeBrazilPhone(input.whatsapp) : null;
  if (input.whatsapp && !whatsapp) throw new AppError("WhatsApp inválido. Use DDD + número.");
  const city = findCity(input.state, input.city);
  if (!city) throw new AppError("Município não encontrado nesta UF.");

  const data: Prisma.LeadUpdateInput = {
    name: input.name,
    normalizedName: normalizeBusinessName(input.name),
    category: input.category,
    nicheKey: input.nicheKey,
    address: input.address,
    neighborhood: input.neighborhood,
    city: city.name,
    cityNormalized: normalizeText(city.name),
    state: input.state,
    phone: phone?.national ?? null,
    phoneE164: phone?.e164 ?? null,
    phoneType: phone?.type ?? null,
    whatsappE164: whatsapp?.e164 ?? null,
    whatsappSource: whatsapp && whatsapp.e164 !== lead.whatsappE164 ? "MANUAL" : lead.whatsappSource,
    email: input.email?.toLowerCase() ?? null,
    emailSource: input.email && input.email.toLowerCase() !== lead.email ? "MANUAL" : lead.emailSource,
    instagramUrl: input.instagramUrl,
    facebookUrl: input.facebookUrl,
    websiteUrl: normalizeWebsiteUrl(input.websiteUrl),
  };
  const changed = Object.entries(data)
    .filter(([key, value]) => (lead as Record<string, unknown>)[key] !== value)
    .map(([key]) => key)
    .filter((k) => !["normalizedName", "cityNormalized", "phoneType", "whatsappSource", "emailSource"].includes(k));

  const updated = await db.lead.update({ where: { id }, data });
  if (changed.length) {
    await recordActivity({ leadId: id, type: "LEAD_UPDATED", description: `Dados editados: ${changed.join(", ")}.`, actorId: userId });
  }
  return updated;
}

// ───────────────────────────── Funil ─────────────────────────────

export interface StageChangeOptions {
  userId?: string | null;
  actorType?: "USER" | "SYSTEM" | "AGENT";
  lossReason?: LossReason | null;
  lossNote?: string | null;
  dealValue?: number | null;
  note?: string;
}

export async function changeLeadStage(leadId: string, stage: LeadStage, opts: StageChangeOptions = {}, tx?: Tx): Promise<void> {
  const client = tx ?? db;
  const lead = await client.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Lead não encontrado.");
  if (lead.stage === stage) return;
  if (lead.stage === "DO_NOT_CONTACT" && opts.actorType !== "USER") return; // só o usuário reverte
  if (stage === "LOST" && !opts.lossReason) throw new AppError("Informe o motivo da perda.");
  if (stage === "WON" && (opts.dealValue === null || opts.dealValue === undefined || opts.dealValue <= 0)) {
    throw new AppError("Informe o valor da venda fechada.");
  }

  await client.lead.update({
    where: { id: leadId },
    data: {
      stage,
      stageChangedAt: new Date(),
      ...(stage === "LOST" ? { lossReason: opts.lossReason, lossNote: opts.lossNote ?? null } : {}),
      ...(stage === "WON" ? { dealValue: opts.dealValue, wonAt: new Date(), lossReason: null } : {}),
    },
  });
  const extra =
    stage === "LOST" && opts.lossReason
      ? ` Motivo: ${LOSS_REASON_LABELS[opts.lossReason]}.`
      : stage === "WON" && opts.dealValue
        ? ` Valor: R$ ${opts.dealValue.toFixed(2).replace(".", ",")}.`
        : "";
  await recordActivity(
    {
      leadId,
      type: "STAGE_CHANGED",
      description: `Etapa: ${STAGE_LABELS[lead.stage].label} → ${STAGE_LABELS[stage].label}.${extra}${opts.note ? ` ${opts.note}` : ""}`,
      metadata: { from: lead.stage, to: stage },
      actorType: opts.actorType ?? (opts.userId ? "USER" : "SYSTEM"),
      actorId: opts.userId ?? null,
    },
    tx,
  );
}

/** Cancela mensagens pendentes e tarefas abertas de acompanhamento de um lead. */
export async function cancelPendingOutreach(leadId: string, reason: string, tx?: Tx): Promise<void> {
  const client = tx ?? db;
  await client.message.updateMany({
    where: { leadId, direction: "OUTBOUND", status: { in: ["PENDING_APPROVAL", "APPROVED", "QUEUED"] } },
    data: { status: "CANCELLED", error: reason },
  });
  await client.followUpTask.updateMany({
    where: { leadId, status: "OPEN", type: { in: ["FOLLOW_UP", "CALL"] } },
    data: { status: "CANCELLED" },
  });
}

export async function markDoNotContact(
  leadId: string,
  meta: { reason: string; source: string; userId?: string | null; actorType?: "USER" | "SYSTEM" | "AGENT" },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundError("Lead não encontrado.");
    await addSuppression(
      { phoneE164: lead.phoneE164, whatsappE164: lead.whatsappE164, email: lead.email },
      { reason: meta.reason, source: meta.source, leadId, userId: meta.userId },
      tx,
    );
    await tx.lead.update({
      where: { id: leadId },
      data: { doNotContact: true, doNotContactAt: new Date(), doNotContactReason: meta.reason, whatsappOptInAt: null },
    });
    await changeLeadStage(leadId, "DO_NOT_CONTACT", { userId: meta.userId, actorType: meta.actorType ?? "USER" }, tx);
    await cancelPendingOutreach(leadId, "Contato bloqueado: não contatar novamente.", tx);
    await recordActivity(
      { leadId, type: "OPT_OUT", description: `Marcado como “não contatar novamente”: ${meta.reason}`, actorId: meta.userId ?? null, actorType: meta.actorType },
      tx,
    );
  });
  await audit({ userId: meta.userId, action: "lead.do_not_contact", entityType: "Lead", entityId: leadId, metadata: { source: meta.source } });
}

export async function recordWhatsappOptIn(leadId: string, note: string, userId: string): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Lead não encontrado.");
  if (lead.doNotContact || (await isSuppressed(lead))) {
    throw new AppError("Este contato pediu para não receber mensagens. Não é possível registrar opt-in.");
  }
  await db.lead.update({ where: { id: leadId }, data: { whatsappOptInAt: new Date(), whatsappOptInNote: note } });
  await recordActivity({ leadId, type: "OPT_IN", description: `Consentimento para WhatsApp registrado: ${note}`, actorId: userId });
  await audit({ userId, action: "lead.whatsapp_opt_in", entityType: "Lead", entityId: leadId });
}

// ───────────────────────────── Notas e tarefas ─────────────────────────────

export async function addNote(leadId: string, body: string, userId: string) {
  const note = await db.note.create({ data: { leadId, body, authorId: userId } });
  await recordActivity({ leadId, type: "NOTE_ADDED", description: "Observação adicionada.", actorId: userId });
  return note;
}

export async function createTask(
  leadId: string,
  input: { title: string; type: Prisma.FollowUpTaskCreateInput["type"]; dueAt: Date; auto?: boolean },
  userId?: string | null,
) {
  const task = await db.followUpTask.create({
    data: { leadId, title: input.title, type: input.type, dueAt: input.dueAt, auto: input.auto ?? false, createdById: userId ?? null },
  });
  await recordActivity({
    leadId,
    type: "TASK_CREATED",
    description: `Próximo passo agendado: ${input.title}.`,
    actorId: userId ?? null,
    actorType: input.auto ? "AGENT" : undefined,
  });
  return task;
}

export async function setTaskStatus(taskId: string, status: "DONE" | "CANCELLED" | "OPEN", userId: string) {
  const task = await db.followUpTask.update({
    where: { id: taskId },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });
  if (status === "DONE") {
    await recordActivity({ leadId: task.leadId, type: "TASK_COMPLETED", description: `Concluído: ${task.title}.`, actorId: userId });
  }
  return task;
}

// ───────────────────────────── LGPD ─────────────────────────────

export async function exportLeadData(leadId: string, userId: string) {
  const lead = await getLeadDetail(leadId);
  await recordActivity({ leadId, type: "DATA_EXPORTED", description: "Dados do lead exportados (LGPD).", actorId: userId });
  await audit({ userId, action: "lead.export", entityType: "Lead", entityId: leadId });
  return lead;
}

/**
 * Exclusão a pedido do titular: remove o lead e todo o histórico, mantendo apenas o HMAC
 * do contato na lista de supressão para impedir novas abordagens.
 */
export async function eraseLead(leadId: string, userId: string, reason: string): Promise<void> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Lead não encontrado.");
  await db.$transaction(async (tx) => {
    await addSuppression(
      { phoneE164: lead.phoneE164, whatsappE164: lead.whatsappE164, email: lead.email },
      { reason: `Exclusão de dados: ${reason}`, source: "ERASURE", leadId: null, userId },
      tx,
    );
    await tx.job.updateMany({ where: { leadId, status: "QUEUED" }, data: { status: "CANCELLED", lastError: "Lead excluído." } });
    await tx.lead.delete({ where: { id: leadId } });
  });
  await audit({ userId, action: "lead.erase", entityType: "Lead", entityId: leadId, metadata: { reason } });
}
