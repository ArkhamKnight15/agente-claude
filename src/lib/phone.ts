/** Normalização de telefones brasileiros (E.164) e utilitários de WhatsApp. */

export type PhoneKind = "MOBILE" | "LANDLINE" | "UNKNOWN";

export interface NormalizedPhone {
  e164: string; // +5511987654321
  national: string; // (11) 98765-4321
  ddd: string;
  type: PhoneKind;
}

// DDDs válidos atribuídos pela Anatel.
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44,
  45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81,
  82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Converte um telefone em formato livre para E.164 brasileiro.
 * Retorna null para números inválidos ou não geográficos (0800, 4004 etc.).
 */
export function normalizeBrazilPhone(raw: string | null | undefined): NormalizedPhone | null {
  if (!raw) return null;
  let digits = onlyDigits(raw);
  if (!digits) return null;

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && (digits.length === 13 || digits.length === 12)) {
    // Formato com código de operadora: 0 + operadora (2 dígitos) + DDD + número
    digits = digits.slice(3);
  } else if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10 && digits.length !== 11) return null;

  const ddd = digits.slice(0, 2);
  if (!VALID_DDDS.has(Number(ddd))) return null;
  const subscriber = digits.slice(2);

  let type: PhoneKind = "UNKNOWN";
  if (subscriber.length === 9) {
    if (!subscriber.startsWith("9")) return null;
    type = "MOBILE";
  } else if (subscriber.length === 8) {
    const first = Number(subscriber[0]);
    if (first >= 2 && first <= 5) type = "LANDLINE";
    else if (first >= 6) type = "MOBILE"; // celulares antigos sem o nono dígito
    else return null;
  }

  const normalizedSubscriber =
    type === "MOBILE" && subscriber.length === 8 ? `9${subscriber}` : subscriber;

  return {
    e164: `+55${ddd}${normalizedSubscriber}`,
    national: formatNational(ddd, normalizedSubscriber),
    ddd,
    type,
  };
}

function formatNational(ddd: string, subscriber: string): string {
  const head = subscriber.slice(0, subscriber.length - 4);
  const tail = subscriber.slice(-4);
  return `(${ddd}) ${head}-${tail}`;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const normalized = normalizeBrazilPhone(e164);
  return normalized ? normalized.national : e164;
}

/** Link click-to-chat oficial do WhatsApp (envio manual pelo próprio usuário). */
export function waMeLink(e164: string, text?: string): string {
  const number = onlyDigits(e164);
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${number}${query}`;
}

/** Versão parcialmente mascarada para logs: +55 11 9****-4321 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const digits = onlyDigits(e164);
  if (digits.length < 6) return "***";
  return `+${digits.slice(0, 4)}****${digits.slice(-4)}`;
}
