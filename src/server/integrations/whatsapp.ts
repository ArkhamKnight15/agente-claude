import { createHmac } from "node:crypto";
import { onlyDigits } from "@/lib/phone";
import { getEnv } from "@/server/env";
import { IntegrationError, IntegrationNotConfiguredError } from "@/server/errors";
import { requestJson } from "@/server/integrations/http";
import { safeEqual } from "@/server/security/crypto";

/**
 * WhatsApp Business Platform — Cloud API oficial da Meta.
 * Envio: POST /{version}/{phone-number-id}/messages
 * Webhooks: assinatura X-Hub-Signature-256 (HMAC-SHA256 com o App Secret).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

export function isWhatsappConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export function isWhatsappWebhookConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.WHATSAPP_APP_SECRET && env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
}

export function whatsappTemplateConfigured(): boolean {
  return Boolean(getEnv().WHATSAPP_TEMPLATE_NAME);
}

interface GraphError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_data?: { details?: string };
  fbtrace_id?: string;
}

interface SendResponse {
  messages?: Array<{ id: string; message_status?: string }>;
  contacts?: Array<{ input: string; wa_id: string }>;
  error?: GraphError;
}

// Códigos temporários (limites de taxa / indisponibilidade).
const RETRYABLE_CODES = new Set([4, 80007, 130429, 131000, 131016, 131056, 133004]);

const ERROR_HINTS: Record<number, string> = {
  190: "Token de acesso inválido ou expirado — gere um token permanente (usuário do sistema).",
  10: "Permissão negada — verifique as permissões whatsapp_business_messaging do token.",
  100: "Parâmetro inválido na requisição.",
  131026: "Mensagem não entregável (número sem WhatsApp ou bloqueou a empresa).",
  131047: "Mais de 24h desde a última resposta do cliente — use um modelo aprovado.",
  131051: "Tipo de mensagem não suportado.",
  132000: "Quantidade de parâmetros diferente do modelo aprovado.",
  132001: "Modelo inexistente ou não aprovado no idioma configurado.",
  133010: "Número da empresa não registrado na Cloud API.",
  368: "Conta temporariamente bloqueada por violação de políticas.",
  130429: "Limite de taxa da API atingido.",
  131056: "Muitas mensagens para o mesmo destinatário em pouco tempo.",
};

function graphUrl(path: string): string {
  const env = getEnv();
  return `${env.WHATSAPP_GRAPH_URL}/${env.WHATSAPP_API_VERSION}/${path}`;
}

function toIntegrationError(status: number, error?: GraphError): IntegrationError {
  const code = error?.code;
  const hint = code ? ERROR_HINTS[code] : undefined;
  const message = `WhatsApp: ${hint ?? error?.message ?? `HTTP ${status}`}${error?.error_data?.details ? ` (${error.error_data.details})` : ""}`;
  const retryable = (code !== undefined && RETRYABLE_CODES.has(code)) || status >= 500;
  return new IntegrationError("WhatsApp", message, retryable, code ? String(code) : String(status));
}

async function postMessage(payload: Record<string, unknown>): Promise<{ providerMessageId: string; waId: string | null }> {
  const env = getEnv();
  if (!isWhatsappConfigured()) {
    throw new IntegrationNotConfiguredError("WhatsApp", "Defina WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID.");
  }
  const { status, data } = await requestJson<SendResponse>(graphUrl(`${env.WHATSAPP_PHONE_NUMBER_ID}/messages`), {
    integration: "WhatsApp",
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    body: { messaging_product: "whatsapp", recipient_type: "individual", ...payload },
  });
  const id = data?.messages?.[0]?.id;
  if (status !== 200 || !id) throw toIntegrationError(status, data?.error);
  return { providerMessageId: id, waId: data?.contacts?.[0]?.wa_id ?? null };
}

/** Texto livre — permitido somente dentro da janela de 24h após mensagem do cliente. */
export function sendWhatsappText(toE164: string, body: string) {
  return postMessage({ to: onlyDigits(toE164), type: "text", text: { preview_url: false, body } });
}

/** Modelo aprovado pela Meta (obrigatório para iniciar conversas). */
export function sendWhatsappTemplate(toE164: string, bodyParams: string[], templateName?: string) {
  const env = getEnv();
  const name = templateName ?? env.WHATSAPP_TEMPLATE_NAME;
  if (!name) throw new IntegrationNotConfiguredError("WhatsApp", "Defina WHATSAPP_TEMPLATE_NAME com um modelo aprovado.");
  return postMessage({
    to: onlyDigits(toE164),
    type: "template",
    template: {
      name,
      language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
      components: bodyParams.length
        ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text: text.slice(0, 1000) })) }]
        : [],
    },
  });
}

/** Consulta o número configurado — usado no botão "Testar conexão". */
export async function getWhatsappPhoneInfo(): Promise<{ displayPhone: string; verifiedName: string; quality: string | null }> {
  const env = getEnv();
  if (!isWhatsappConfigured()) throw new IntegrationNotConfiguredError("WhatsApp");
  const { status, data } = await requestJson<{
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    error?: GraphError;
  }>(graphUrl(`${env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`), {
    integration: "WhatsApp",
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
  });
  if (status !== 200 || !data?.display_phone_number) throw toIntegrationError(status, data?.error);
  return { displayPhone: data.display_phone_number, verifiedName: data.verified_name ?? "", quality: data.quality_rating ?? null };
}

// ───────────────────────────── Webhooks ─────────────────────────────

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  return safeEqual(expected, signatureHeader);
}

export interface InboundWhatsappMessage {
  kind: "message";
  providerMessageId: string;
  fromE164: string;
  profileName: string | null;
  text: string;
  type: string;
  timestamp: Date;
  contextMessageId: string | null;
}

export interface WhatsappStatusUpdate {
  kind: "status";
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  recipientE164: string;
  errorCode: string | null;
  errorMessage: string | null;
}

export type WhatsappWebhookEvent = InboundWhatsappMessage | WhatsappStatusUpdate;

interface WebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          button?: { text: string; payload?: string };
          interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
          context?: { id?: string };
        }>;
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title?: string; message?: string; error_data?: { details?: string } }>;
        }>;
      };
    }>;
  }>;
}

export function parseWhatsappWebhook(payload: unknown): WhatsappWebhookEvent[] {
  const body = payload as WebhookPayload;
  if (body?.object !== "whatsapp_business_account") return [];
  const events: WhatsappWebhookEvent[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value) continue;
      const names = new Map((change.value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of change.value.messages ?? []) {
        const text =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          `[mensagem do tipo ${m.type}]`;
        events.push({
          kind: "message",
          providerMessageId: m.id,
          fromE164: `+${onlyDigits(m.from)}`,
          profileName: names.get(m.from) ?? null,
          text,
          type: m.type,
          timestamp: new Date(Number(m.timestamp) * 1000),
          contextMessageId: m.context?.id ?? null,
        });
      }
      for (const s of change.value.statuses ?? []) {
        const err = s.errors?.[0];
        events.push({
          kind: "status",
          providerMessageId: s.id,
          status: s.status,
          timestamp: new Date(Number(s.timestamp) * 1000),
          recipientE164: `+${onlyDigits(s.recipient_id)}`,
          errorCode: err ? String(err.code) : null,
          errorMessage: err ? (err.error_data?.details ?? err.message ?? err.title ?? null) : null,
        });
      }
    }
  }
  return events;
}
