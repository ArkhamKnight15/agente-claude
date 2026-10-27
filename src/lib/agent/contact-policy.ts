import type { Channel, LeadStage, MessagePurpose } from "@/generated/prisma/enums";
import type { ContactPolicy } from "@/lib/settings-schema";
import { APP_TIMEZONE, zonedParts } from "@/lib/format";
import { normalizeText } from "@/lib/text";

/**
 * Regras que decidem se um contato pode acontecer. Função pura: o serviço de mensagens
 * monta o contexto a partir do banco e aplica o resultado.
 */

export interface OutboundRecord {
  sentAt: Date;
  body: string;
  purpose: MessagePurpose;
}

export interface ContactContext {
  channel: Channel;
  purpose: MessagePurpose;
  method: "API" | "MANUAL";
  body: string;
  lead: {
    stage: LeadStage;
    doNotContact: boolean;
    isDemo: boolean;
    phoneE164: string | null;
    whatsappE164: string | null;
    email: string | null;
    whatsappOptInAt: Date | null;
  };
  suppressed: boolean;
  outbound: OutboundRecord[]; // mensagens já enviadas a este lead (qualquer canal)
  lastInboundAt: Date | null;
  sentTodayOnChannel: number;
  integrationConfigured: boolean;
  whatsappTemplateConfigured: boolean;
}

export interface ContactDecision {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  /** Quando fora da janela de envio, a partir de quando o envio é permitido. */
  deferUntil: Date | null;
  /** WhatsApp: dentro de 24h após resposta do cliente é permitido texto livre. */
  whatsappSessionOpen: boolean;
}

const CLOSED_STAGES: LeadStage[] = ["WON", "LOST", "DO_NOT_CONTACT"];
const DAY = 86400_000;

export function nextSendWindow(now: Date, policy: ContactPolicy, timeZone = APP_TIMEZONE): Date | null {
  const inWindow = (date: Date) => {
    const p = zonedParts(date, timeZone);
    return (
      policy.sendWeekdays.includes(p.weekday) &&
      p.hour >= policy.sendWindowStartHour &&
      p.hour < policy.sendWindowEndHour
    );
  };
  if (inWindow(now)) return null;
  // Avança em passos de 15 minutos até encontrar a próxima janela (máx. 8 dias).
  const step = 15 * 60_000;
  const start = Math.ceil(now.getTime() / step) * step;
  for (let t = start; t < now.getTime() + 8 * DAY; t += step) {
    const candidate = new Date(t);
    if (inWindow(candidate)) return candidate;
  }
  return null;
}

export function evaluateContactPolicy(ctx: ContactContext, policy: ContactPolicy, now = new Date()): ContactDecision {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const { lead } = ctx;

  if (lead.doNotContact || lead.stage === "DO_NOT_CONTACT") blockers.push("Lead marcado como “não contatar novamente”.");
  if (ctx.suppressed) blockers.push("Contato está na lista de supressão (pediu para não receber mensagens).");
  if (lead.isDemo) blockers.push("Lead de demonstração: envios reais são bloqueados.");

  const outreach = ctx.purpose === "INITIAL" || ctx.purpose === "FOLLOW_UP";
  if (outreach && CLOSED_STAGES.includes(lead.stage)) {
    blockers.push("Negociação encerrada: não envie novas abordagens comerciais.");
  }

  // Destino válido no canal.
  if (ctx.channel === "WHATSAPP" && !(lead.whatsappE164 ?? lead.phoneE164)) blockers.push("Lead sem número de telefone válido.");
  if (ctx.channel === "EMAIL" && !lead.email) blockers.push("Lead sem e-mail comercial.");

  // Integração (somente para envio via API — envio manual é feito pelo próprio usuário).
  if (ctx.method === "API" && !ctx.integrationConfigured) {
    blockers.push(`Integração de ${ctx.channel === "WHATSAPP" ? "WhatsApp" : "e-mail"} não configurada.`);
  }

  const whatsappSessionOpen = Boolean(ctx.lastInboundAt && now.getTime() - ctx.lastInboundAt.getTime() < DAY);
  if (ctx.channel === "WHATSAPP" && ctx.method === "API" && !whatsappSessionOpen) {
    if (policy.whatsappRequireOptIn && !lead.whatsappOptInAt) {
      blockers.push(
        "WhatsApp API exige consentimento (opt-in) para mensagens iniciadas pela empresa. Registre o opt-in ou use o envio manual.",
      );
    }
    if (!ctx.whatsappTemplateConfigured) {
      blockers.push("Fora da janela de 24h só é possível enviar modelos aprovados pela Meta — configure WHATSAPP_TEMPLATE_NAME.");
    }
  }

  // Anti-insistência: mensagens sem resposta.
  const lastInbound = ctx.lastInboundAt?.getTime() ?? 0;
  const unanswered = ctx.outbound.filter((m) => m.sentAt.getTime() > lastInbound);
  if (outreach && unanswered.length >= policy.maxUnansweredMessages) {
    blockers.push(
      `Limite de ${policy.maxUnansweredMessages} mensagem(ns) sem resposta atingido. Aguarde o retorno do cliente.`,
    );
  }

  const lastSent = ctx.outbound.reduce<Date | null>((acc, m) => (!acc || m.sentAt > acc ? m.sentAt : acc), null);
  if (outreach && lastSent && now.getTime() - lastSent.getTime() < policy.minDaysBetweenContacts * DAY && !whatsappSessionOpen) {
    blockers.push(`Último contato há menos de ${policy.minDaysBetweenContacts} dia(s).`);
  }

  // Texto duplicado recente.
  const normalizedBody = normalizeText(ctx.body);
  const duplicate = ctx.outbound.some(
    (m) =>
      now.getTime() - m.sentAt.getTime() < policy.duplicateWindowDays * DAY && normalizeText(m.body) === normalizedBody,
  );
  if (duplicate) blockers.push("Mensagem idêntica já enviada recentemente a este contato.");

  // Limite diário do canal (apenas API — o envio manual é responsabilidade do usuário, mas avisamos).
  const dailyLimit = ctx.channel === "WHATSAPP" ? policy.dailyLimitWhatsapp : policy.dailyLimitEmail;
  if (ctx.sentTodayOnChannel >= dailyLimit) {
    if (ctx.method === "API") blockers.push(`Limite diário de envios por ${ctx.channel === "WHATSAPP" ? "WhatsApp" : "e-mail"} (${dailyLimit}) atingido.`);
    else warnings.push(`Você já atingiu o limite diário configurado (${dailyLimit}) neste canal.`);
  }

  const deferUntil = ctx.method === "API" ? nextSendWindow(now, policy) : null;
  if (ctx.method === "MANUAL" && nextSendWindow(now, policy)) {
    warnings.push("Fora da janela de envio configurada (horário comercial).");
  }

  return { allowed: blockers.length === 0, blockers, warnings, deferUntil, whatsappSessionOpen };
}
