import type { Message, Prisma } from "@/generated/prisma/client";
import type { Channel, MessagePurpose, MessageStatus } from "@/generated/prisma/enums";
import { evaluateContactPolicy, type ContactDecision } from "@/lib/agent/contact-policy";
import { lintOutboundMessage } from "@/lib/agent/message-lint";
import { classifyReplyByRules } from "@/lib/agent/reply-classifier";
import { APP_TIMEZONE, zonedParts } from "@/lib/format";
import { maskPhone } from "@/lib/phone";
import { CHANNEL_LABELS } from "@/data/labels";
import { db } from "@/server/db";
import { getEnv } from "@/server/env";
import { AppError, IntegrationError, NotFoundError, errorMessage } from "@/server/errors";
import { sendEmail, isSmtpConfigured } from "@/server/integrations/email";
import {
  isWhatsappConfigured,
  sendWhatsappTemplate,
  sendWhatsappText,
  whatsappTemplateConfigured,
  type InboundWhatsappMessage,
  type WhatsappStatusUpdate,
} from "@/server/integrations/whatsapp";
import { enqueueJob } from "@/server/jobs/queue";
import { audit } from "@/server/security/audit";
import { signToken } from "@/server/security/crypto";
import { recordActivity } from "@/server/services/activity";
import { logEvent } from "@/server/services/events";
import { changeLeadStage } from "@/server/services/leads";
import { getContactPolicy, getDefaultPackage, getSenderProfile, getAgentSettings } from "@/server/services/settings";
import { addSuppression, isSuppressed } from "@/server/services/suppression";

const EDITABLE: MessageStatus[] = ["PENDING_APPROVAL", "APPROVED", "FAILED"];
const SENT_STATUSES: MessageStatus[] = ["SENT", "DELIVERED", "READ"];
const EARLY_STAGES = ["FOUND", "VERIFYING", "QUALIFIED", "MESSAGE_READY"] as const;

export function integrationConfiguredFor(channel: Channel): boolean {
  return channel === "WHATSAPP" ? isWhatsappConfigured() : isSmtpConfigured();
}

function startOfTodayInSaoPaulo(now = new Date()): Date {
  const p = zonedParts(now, APP_TIMEZONE);
  // São Paulo não tem horário de verão desde 2019: UTC-3 fixo.
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 3, 0, 0));
}

// ───────────────────────────── Política de contato ─────────────────────────────

export async function evaluateMessagePolicy(message: Message, method: "API" | "MANUAL"): Promise<ContactDecision> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: message.leadId } });
  const [policy, suppressed, outbound, lastInbound, sentToday] = await Promise.all([
    getContactPolicy(),
    isSuppressed(lead),
    db.message.findMany({
      where: { leadId: lead.id, direction: "OUTBOUND", status: { in: SENT_STATUSES }, sentAt: { not: null } },
      select: { sentAt: true, body: true, purpose: true },
    }),
    db.message.findFirst({ where: { leadId: lead.id, direction: "INBOUND" }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
    db.message.count({
      where: { direction: "OUTBOUND", channel: message.channel, status: { in: SENT_STATUSES }, sentAt: { gte: startOfTodayInSaoPaulo() } },
    }),
  ]);
  return evaluateContactPolicy(
    {
      channel: message.channel,
      purpose: message.purpose,
      method,
      body: message.body,
      lead: {
        stage: lead.stage,
        doNotContact: lead.doNotContact,
        isDemo: lead.isDemo,
        phoneE164: lead.phoneE164,
        whatsappE164: lead.whatsappE164,
        email: lead.email,
        whatsappOptInAt: lead.whatsappOptInAt,
      },
      suppressed,
      outbound: outbound.map((m) => ({ sentAt: m.sentAt!, body: m.body, purpose: m.purpose })),
      lastInboundAt: lastInbound?.receivedAt ?? null,
      sentTodayOnChannel: sentToday,
      integrationConfigured: integrationConfiguredFor(message.channel),
      whatsappTemplateConfigured: whatsappTemplateConfigured(),
    },
    policy,
  );
}

async function loadMessage(id: string): Promise<Message> {
  const message = await db.message.findUnique({ where: { id } });
  if (!message) throw new NotFoundError("Mensagem não encontrada.");
  return message;
}

async function lintFor(leadId: string, body: string, channel: Channel): Promise<string[]> {
  const [lead, pkg, profile, settings] = await Promise.all([
    db.lead.findUniqueOrThrow({ where: { id: leadId } }),
    getDefaultPackage(),
    getSenderProfile(),
    getAgentSettings(),
  ]);
  if (!pkg) return [];
  return lintOutboundMessage(body, {
    price: pkg.price,
    includedFeatures: pkg.features,
    maxChars: channel === "WHATSAPP" ? settings.messageMaxChars : 2000,
    websiteStatus: lead.websiteStatus,
    allowedUrls: [profile.portfolioUrl, getEnv().APP_URL].filter(Boolean),
  });
}

// ───────────────────────────── Rascunhos e aprovação ─────────────────────────────

export async function createOutboundDraft(input: {
  leadId: string;
  channel: Channel;
  purpose: MessagePurpose;
  subject?: string | null;
  body: string;
  userId?: string | null;
  campaignId?: string | null;
  inReplyToId?: string | null;
  generatedBy?: string;
}): Promise<Message> {
  const lead = await db.lead.findUnique({ where: { id: input.leadId } });
  if (!lead) throw new NotFoundError("Lead não encontrado.");
  const to = input.channel === "WHATSAPP" ? (lead.whatsappE164 ?? lead.phoneE164) : lead.email;
  if (!to) throw new AppError(`O lead não tem ${CHANNEL_LABELS[input.channel]} cadastrado.`);
  const message = await db.message.create({
    data: {
      leadId: input.leadId,
      campaignId: input.campaignId ?? null,
      channel: input.channel,
      direction: "OUTBOUND",
      status: "PENDING_APPROVAL",
      purpose: input.purpose,
      subject: input.channel === "EMAIL" ? (input.subject ?? "Contato") : null,
      body: input.body,
      toAddress: to,
      generatedBy: input.generatedBy ?? (input.userId ? "user" : "template"),
      warnings: await lintFor(input.leadId, input.body, input.channel),
      createdById: input.userId ?? null,
      inReplyToId: input.inReplyToId ?? null,
    },
  });
  await recordActivity({
    leadId: input.leadId,
    type: "MESSAGE_DRAFTED",
    description: `Rascunho de ${CHANNEL_LABELS[input.channel]} criado para revisão.`,
    actorId: input.userId ?? null,
  });
  return message;
}

export async function updateDraft(messageId: string, input: { subject?: string | null; body: string }, userId: string): Promise<Message> {
  const message = await loadMessage(messageId);
  if (message.direction !== "OUTBOUND" || !EDITABLE.includes(message.status)) {
    throw new AppError("Só é possível editar mensagens que ainda não foram enviadas.");
  }
  const updated = await db.message.update({
    where: { id: messageId },
    data: {
      body: input.body,
      subject: message.channel === "EMAIL" ? (input.subject ?? message.subject) : null,
      warnings: await lintFor(message.leadId, input.body, message.channel),
      // Editar exige nova aprovação.
      status: "PENDING_APPROVAL",
      approvedAt: null,
      approvedById: null,
      error: null,
    },
  });
  await audit({ userId, action: "message.edit", entityType: "Message", entityId: messageId });
  return updated;
}

export async function approveMessage(messageId: string, userId: string): Promise<Message> {
  const message = await loadMessage(messageId);
  if (message.status !== "PENDING_APPROVAL" && message.status !== "FAILED") {
    throw new AppError("Esta mensagem não está aguardando aprovação.");
  }
  const decision = await evaluateMessagePolicy(message, "MANUAL");
  const hardBlockers = decision.blockers.filter((b) => !b.startsWith("Integração"));
  if (hardBlockers.length) throw new AppError(hardBlockers.join(" "));
  const updated = await db.message.update({
    where: { id: messageId },
    data: { status: "APPROVED", approvedById: userId, approvedAt: new Date(), error: null },
  });
  await recordActivity({ leadId: message.leadId, type: "MESSAGE_APPROVED", description: "Mensagem aprovada para envio.", actorId: userId });
  await audit({ userId, action: "message.approve", entityType: "Message", entityId: messageId });
  return updated;
}

export async function rejectMessage(messageId: string, reason: string, userId: string): Promise<void> {
  const message = await loadMessage(messageId);
  if (!EDITABLE.includes(message.status)) throw new AppError("Esta mensagem não pode mais ser rejeitada.");
  await db.message.update({ where: { id: messageId }, data: { status: "REJECTED", rejectedReason: reason || null } });
  await recordActivity({ leadId: message.leadId, type: "MESSAGE_REJECTED", description: `Mensagem rejeitada${reason ? `: ${reason}` : ""}.`, actorId: userId });
  await audit({ userId, action: "message.reject", entityType: "Message", entityId: messageId });
}

/** Coloca uma mensagem aprovada na fila de envio pela API oficial. */
export async function queueApiSend(messageId: string, userId: string | null): Promise<{ scheduledFor: Date | null }> {
  const message = await loadMessage(messageId);
  if (message.status !== "APPROVED") throw new AppError("Aprove a mensagem antes de enviar.");
  const decision = await evaluateMessagePolicy(message, "API");
  if (!decision.allowed) throw new AppError(decision.blockers.join(" "));
  const runAt = decision.deferUntil ?? new Date();
  await db.message.update({ where: { id: messageId }, data: { status: "QUEUED", scheduledFor: decision.deferUntil, error: null } });
  await enqueueJob(
    "message.send",
    { messageId },
    { runAt, idempotencyKey: `message.send:${messageId}:${message.attempts}`, leadId: message.leadId, maxAttempts: 4 },
  );
  await audit({ userId, action: "message.queue_send", entityType: "Message", entityId: messageId, metadata: { channel: message.channel } });
  return { scheduledFor: decision.deferUntil };
}

async function afterSent(message: Message, data: Prisma.MessageUpdateInput, actor: { userId: string | null; method: "API" | "MANUAL" }) {
  const updated = await db.message.update({ where: { id: message.id }, data });
  const lead = await db.lead.update({ where: { id: message.leadId }, data: { lastContactAt: new Date() } });
  if ((EARLY_STAGES as readonly string[]).includes(lead.stage)) {
    await changeLeadStage(lead.id, "CONTACTED", { userId: actor.userId, actorType: actor.userId ? "USER" : "SYSTEM" });
  }
  await recordActivity({
    leadId: message.leadId,
    type: "MESSAGE_SENT",
    description: `${CHANNEL_LABELS[message.channel]} enviado ${actor.method === "API" ? "pela integração oficial" : "manualmente pelo usuário"}.`,
    actorId: actor.userId,
  });
  return updated;
}

/** O usuário enviou pelo próprio WhatsApp/e-mail (link wa.me ou mailto) e confirma aqui. */
export async function markSentManually(messageId: string, userId: string): Promise<Message> {
  const message = await loadMessage(messageId);
  if (message.status !== "APPROVED") throw new AppError("Aprove a mensagem antes de registrar o envio.");
  const decision = await evaluateMessagePolicy(message, "MANUAL");
  if (!decision.allowed) throw new AppError(decision.blockers.join(" "));
  const updated = await afterSent(
    message,
    { status: "SENT", sendMethod: "MANUAL", sentAt: new Date(), error: null },
    { userId, method: "MANUAL" },
  );
  await audit({ userId, action: "message.mark_sent_manual", entityType: "Message", entityId: messageId });
  return updated;
}

export function unsubscribeUrl(leadId: string): string {
  return `${getEnv().APP_URL}/descadastro/${signToken({ l: leadId }, "unsubscribe")}`;
}

/** URL para o cabeçalho List-Unsubscribe (aceita POST de um clique, RFC 8058). */
export function oneClickUnsubscribeUrl(leadId: string): string {
  return `${getEnv().APP_URL}/api/public/unsubscribe/${signToken({ l: leadId }, "unsubscribe")}`;
}

async function emailFooter(leadId: string): Promise<string> {
  const profile = await getSenderProfile();
  const identity = [profile.companyName || profile.name, profile.cnpj ? `CNPJ ${profile.cnpj}` : null, profile.city]
    .filter(Boolean)
    .join(" · ");
  return `\n\n—\n${identity ? `${identity}\n` : ""}Você recebeu este e-mail por ser um contato comercial público da empresa. Para não receber mais mensagens, acesse ${unsubscribeUrl(leadId)} ou responda “sair”.`;
}

function templateParams(lead: { name: string; city: string }, profile: { name: string; companyName: string }): string[] {
  const map: Record<string, string> = {
    lead_name: lead.name,
    city: lead.city,
    sender_name: profile.name || profile.companyName,
    sender_company: profile.companyName || profile.name,
  };
  const spec = getEnv().WHATSAPP_TEMPLATE_PARAMS;
  return spec
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
    .map((key) => map[key] ?? "");
}

export type SendOutcome = { status: "sent" } | { status: "deferred"; until: Date } | { status: "blocked"; reason: string };

/** Envio real (executado pelo worker). Nunca simula: sem integração, a mensagem falha com o motivo. */
export async function performSend(messageId: string): Promise<SendOutcome> {
  const message = await loadMessage(messageId);
  if (message.status !== "QUEUED") return { status: "blocked", reason: `Status atual: ${message.status}` };
  const decision = await evaluateMessagePolicy(message, "API");
  if (!decision.allowed) {
    const reason = decision.blockers.join(" ");
    await db.message.update({ where: { id: messageId }, data: { status: "FAILED", failedAt: new Date(), error: `Bloqueada: ${reason}`, errorCode: "POLICY" } });
    await recordActivity({ leadId: message.leadId, type: "MESSAGE_FAILED", description: `Envio bloqueado: ${reason}` });
    return { status: "blocked", reason };
  }
  if (decision.deferUntil) {
    await db.message.update({ where: { id: messageId }, data: { scheduledFor: decision.deferUntil } });
    return { status: "deferred", until: decision.deferUntil };
  }

  const lead = await db.lead.findUniqueOrThrow({ where: { id: message.leadId } });
  await db.message.update({ where: { id: messageId }, data: { attempts: { increment: 1 } } });
  try {
    if (message.channel === "WHATSAPP") {
      const to = lead.whatsappE164 ?? lead.phoneE164!;
      if (decision.whatsappSessionOpen) {
        const { providerMessageId } = await sendWhatsappText(to, message.body);
        await afterSent(message, { status: "SENT", sendMethod: "API", sentAt: new Date(), providerMessageId, error: null }, { userId: null, method: "API" });
      } else {
        const profile = await getSenderProfile();
        const params = templateParams(lead, profile);
        const { providerMessageId } = await sendWhatsappTemplate(to, params);
        await afterSent(
          message,
          {
            status: "SENT",
            sendMethod: "API",
            sentAt: new Date(),
            providerMessageId,
            templateName: getEnv().WHATSAPP_TEMPLATE_NAME,
            templateParams: params,
            error: null,
          },
          { userId: null, method: "API" },
        );
      }
    } else {
      const { providerMessageId } = await sendEmail({
        to: lead.email!,
        subject: message.subject ?? "Contato",
        text: `${message.body}${await emailFooter(lead.id)}`,
        unsubscribeUrl: oneClickUnsubscribeUrl(lead.id),
      });
      await afterSent(message, { status: "SENT", sendMethod: "API", sentAt: new Date(), providerMessageId, error: null }, { userId: null, method: "API" });
    }
    await audit({ action: "message.sent", entityType: "Message", entityId: messageId, metadata: { channel: message.channel } });
    return { status: "sent" };
  } catch (error) {
    if (error instanceof IntegrationError && error.retryable) {
      await db.message.update({ where: { id: messageId }, data: { error: errorMessage(error), errorCode: error.providerCode ?? null } });
      throw error; // a fila tenta novamente com backoff
    }
    await markSendFailed(messageId, error);
    return { status: "blocked", reason: errorMessage(error) };
  }
}

export async function markSendFailed(messageId: string, error: unknown): Promise<void> {
  const message = await loadMessage(messageId);
  const reason = errorMessage(error);
  await db.message.update({
    where: { id: messageId },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      error: reason,
      errorCode: error instanceof IntegrationError ? (error.providerCode ?? null) : null,
    },
  });
  await recordActivity({ leadId: message.leadId, type: "MESSAGE_FAILED", description: `Falha no envio por ${CHANNEL_LABELS[message.channel]}: ${reason}` });
  await logEvent({ level: "ERROR", source: `send.${message.channel.toLowerCase()}`, message: `Falha no envio: ${reason}`, leadId: message.leadId });
}

// ───────────────────────────── Status e respostas ─────────────────────────────

const STATUS_RANK: Partial<Record<MessageStatus, number>> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3 };

export async function applyWhatsappStatus(update: WhatsappStatusUpdate): Promise<void> {
  const message = await db.message.findUnique({ where: { providerMessageId: update.providerMessageId } });
  if (!message) return;
  if (update.status === "failed") {
    await markSendFailed(message.id, new IntegrationError("WhatsApp", update.errorMessage ?? "Falha de entrega informada pela Meta.", false, update.errorCode ?? undefined));
    return;
  }
  const next: MessageStatus = update.status === "read" ? "READ" : update.status === "delivered" ? "DELIVERED" : "SENT";
  if ((STATUS_RANK[next] ?? 0) <= (STATUS_RANK[message.status] ?? -1)) return;
  await db.message.update({
    where: { id: message.id },
    data: {
      status: next,
      ...(next === "DELIVERED" ? { deliveredAt: update.timestamp } : {}),
      ...(next === "READ" ? { readAt: update.timestamp, deliveredAt: message.deliveredAt ?? update.timestamp } : {}),
    },
  });
}

async function storeInbound(data: {
  leadId: string;
  channel: Channel;
  body: string;
  subject?: string | null;
  fromAddress: string;
  providerMessageId: string;
  receivedAt: Date;
  inReplyToId: string | null;
  campaignId: string | null;
}): Promise<Message | null> {
  try {
    const message = await db.message.create({
      data: {
        leadId: data.leadId,
        campaignId: data.campaignId,
        channel: data.channel,
        direction: "INBOUND",
        status: "RECEIVED",
        purpose: "REPLY",
        subject: data.subject ?? null,
        body: data.body,
        fromAddress: data.fromAddress,
        providerMessageId: data.providerMessageId,
        receivedAt: data.receivedAt,
        inReplyToId: data.inReplyToId,
      },
    });
    await db.lead.update({ where: { id: data.leadId }, data: { lastReplyAt: data.receivedAt } });
    await recordActivity({ leadId: data.leadId, type: "MESSAGE_RECEIVED", description: `Resposta recebida por ${CHANNEL_LABELS[data.channel]}.` });
    await enqueueJob("inbound.process", { messageId: message.id }, { idempotencyKey: `inbound.process:${message.id}`, leadId: data.leadId, priority: 5 });
    return message;
  } catch (error) {
    // providerMessageId duplicado = webhook reenviado; ignorar.
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }
}

export async function recordInboundWhatsapp(event: InboundWhatsappMessage): Promise<Message | null> {
  const lead = await db.lead.findFirst({
    where: { OR: [{ whatsappE164: event.fromE164 }, { phoneE164: event.fromE164 }] },
    orderBy: { lastContactAt: { sort: "desc", nulls: "last" } },
  });
  if (!lead) {
    // Mesmo sem lead, um pedido de interrupção é respeitado.
    if (classifyReplyByRules(event.text).classification === "OPT_OUT") {
      await addSuppression({ phoneE164: event.fromE164 }, { reason: "Pediu para não receber mensagens (WhatsApp).", source: "WHATSAPP_REPLY" });
    }
    await logEvent({ level: "WARN", source: "webhook.whatsapp", message: `Mensagem recebida de número sem lead cadastrado (${maskPhone(event.fromE164)}).` });
    return null;
  }
  const replyTo = event.contextMessageId
    ? await db.message.findUnique({ where: { providerMessageId: event.contextMessageId }, select: { id: true, campaignId: true } })
    : await db.message.findFirst({
        where: { leadId: lead.id, direction: "OUTBOUND", channel: "WHATSAPP", status: { in: SENT_STATUSES } },
        orderBy: { sentAt: "desc" },
        select: { id: true, campaignId: true },
      });
  return storeInbound({
    leadId: lead.id,
    channel: "WHATSAPP",
    body: event.text,
    fromAddress: event.fromE164,
    providerMessageId: event.providerMessageId,
    receivedAt: event.timestamp,
    inReplyToId: replyTo?.id ?? null,
    campaignId: replyTo?.campaignId ?? null,
  });
}

export async function recordInboundEmail(email: {
  messageId: string | null;
  uid: number;
  inReplyTo: string | null;
  references: string[];
  from: string | null;
  subject: string;
  text: string;
  date: Date;
}): Promise<Message | null> {
  const refs = [email.inReplyTo, ...email.references].filter((r): r is string => Boolean(r));
  const original = refs.length
    ? await db.message.findFirst({ where: { providerMessageId: { in: refs }, direction: "OUTBOUND" }, select: { id: true, leadId: true, campaignId: true } })
    : null;
  const lead = original
    ? await db.lead.findUnique({ where: { id: original.leadId } })
    : email.from
      ? await db.lead.findFirst({ where: { email: email.from }, orderBy: { lastContactAt: { sort: "desc", nulls: "last" } } })
      : null;
  if (!lead) return null;
  return storeInbound({
    leadId: lead.id,
    channel: "EMAIL",
    body: email.text || "(sem texto)",
    subject: email.subject,
    fromAddress: email.from ?? "",
    providerMessageId: email.messageId ?? `imap-uid:${email.uid}:${email.date.getTime()}`,
    receivedAt: email.date,
    inReplyToId: original?.id ?? null,
    campaignId: original?.campaignId ?? null,
  });
}

export async function retryFailedMessage(messageId: string, userId: string): Promise<void> {
  const message = await loadMessage(messageId);
  if (message.status !== "FAILED") throw new AppError("Apenas mensagens com falha podem ser reenviadas.");
  await db.message.update({ where: { id: messageId }, data: { status: "APPROVED", error: null, errorCode: null, approvedById: userId, approvedAt: new Date() } });
  await queueApiSend(messageId, userId);
}

export async function listMessages(filter: {
  box: "review" | "approved" | "sent" | "inbox" | "failed";
  channel?: Channel;
  page?: number;
  pageSize?: number;
}) {
  const statusByBox: Record<typeof filter.box, Prisma.MessageWhereInput> = {
    review: { direction: "OUTBOUND", status: "PENDING_APPROVAL" },
    approved: { direction: "OUTBOUND", status: { in: ["APPROVED", "QUEUED"] } },
    sent: { direction: "OUTBOUND", status: { in: SENT_STATUSES } },
    inbox: { direction: "INBOUND" },
    failed: { direction: "OUTBOUND", status: "FAILED" },
  };
  const where: Prisma.MessageWhereInput = { ...statusByBox[filter.box], ...(filter.channel ? { channel: filter.channel } : {}) };
  const pageSize = Math.min(50, filter.pageSize ?? 20);
  const page = Math.max(1, filter.page ?? 1);
  const orderBy: Prisma.MessageOrderByWithRelationInput =
    filter.box === "inbox" ? { receivedAt: "desc" } : filter.box === "sent" ? { sentAt: "desc" } : { createdAt: "desc" };
  const [total, items] = await db.$transaction([
    db.message.count({ where }),
    db.message.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        lead: {
          select: { id: true, name: true, city: true, state: true, stage: true, priority: true, score: true, websiteStatus: true, isDemo: true, phoneE164: true, whatsappE164: true, email: true, whatsappOptInAt: true },
        },
        campaign: { select: { id: true, name: true } },
      },
    }),
  ]);
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function messageCounts() {
  const [review, approved, failed, inboxUnhandled] = await Promise.all([
    db.message.count({ where: { direction: "OUTBOUND", status: "PENDING_APPROVAL" } }),
    db.message.count({ where: { direction: "OUTBOUND", status: { in: ["APPROVED", "QUEUED"] } } }),
    db.message.count({ where: { direction: "OUTBOUND", status: "FAILED" } }),
    db.followUpTask.count({ where: { status: "OPEN", type: "REPLY" } }),
  ]);
  return { review, approved, failed, inboxUnhandled };
}
