import type { TelefoneTipo } from "@/types";

/** Telefones brasileiros: normalização para E.164 (sem "+") e links do WhatsApp. */

// DDDs válidos atribuídos pela Anatel.
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51,
  53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94,
  95, 96, 97, 98, 99,
]);

export interface TelefoneNormalizado {
  numero: string; // 5511987654321
  tipo: TelefoneTipo;
}

/** Retorna null para números inválidos ou não geográficos (0800, 4004 etc.). */
export function normalizarTelefone(bruto: string | null | undefined): TelefoneNormalizado | null {
  if (!bruto) return null;
  let digitos = bruto.replace(/\D/g, "");
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) digitos = digitos.slice(2);
  else if (digitos.startsWith("0") && (digitos.length === 13 || digitos.length === 14)) digitos = digitos.slice(3); // 0 + operadora + DDD
  else if (digitos.startsWith("0") && (digitos.length === 11 || digitos.length === 12)) digitos = digitos.slice(1); // 0 + DDD

  if (digitos.length !== 10 && digitos.length !== 11) return null;
  const ddd = digitos.slice(0, 2);
  if (!DDDS.has(Number(ddd))) return null;
  let assinante = digitos.slice(2);

  let tipo: TelefoneTipo;
  if (assinante.length === 9) {
    if (!assinante.startsWith("9")) return null;
    tipo = "celular";
  } else {
    const primeiro = Number(assinante[0]);
    if (primeiro >= 2 && primeiro <= 5) tipo = "fixo";
    else if (primeiro >= 6) {
      tipo = "celular"; // celular antigo, sem o nono dígito
      assinante = `9${assinante}`;
    } else return null;
  }
  return { numero: `55${ddd}${assinante}`, tipo };
}

/** (11) 98765-4321 */
export function formatarTelefone(numero: string | null): string {
  if (!numero) return "";
  const local = numero.startsWith("55") ? numero.slice(2) : numero;
  const ddd = local.slice(0, 2);
  const assinante = local.slice(2);
  return `(${ddd}) ${assinante.slice(0, -4)}-${assinante.slice(-4)}`;
}

/** Link oficial do WhatsApp (click-to-chat): abre a conversa com o texto pronto; quem envia é você. */
export function linkWhatsApp(numero: string, texto?: string): string {
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}
