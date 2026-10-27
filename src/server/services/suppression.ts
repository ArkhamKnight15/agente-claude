import type { SuppressionType } from "@/generated/prisma/enums";
import { normalizeBrazilPhone } from "@/lib/phone";
import { db, type Tx } from "@/server/db";
import { hmac } from "@/server/security/crypto";

/**
 * Lista de supressão: impede novos contatos com quem pediu para não receber mensagens.
 * Armazena apenas um HMAC do telefone/e-mail — continua funcionando mesmo após a exclusão
 * dos dados pessoais do lead (LGPD).
 */

export function suppressionHash(type: SuppressionType, value: string): string | null {
  if (type === "PHONE") {
    const phone = normalizeBrazilPhone(value);
    return phone ? hmac(phone.e164, "suppression:phone") : null;
  }
  const email = value.trim().toLowerCase();
  return email.includes("@") ? hmac(email, "suppression:email") : null;
}

export interface ContactPoints {
  phoneE164?: string | null;
  whatsappE164?: string | null;
  email?: string | null;
}

function hashesFor(points: ContactPoints): Array<{ type: SuppressionType; hash: string }> {
  const out: Array<{ type: SuppressionType; hash: string }> = [];
  for (const phone of [points.phoneE164, points.whatsappE164]) {
    const hash = phone ? suppressionHash("PHONE", phone) : null;
    if (hash) out.push({ type: "PHONE", hash });
  }
  const emailHash = points.email ? suppressionHash("EMAIL", points.email) : null;
  if (emailHash) out.push({ type: "EMAIL", hash: emailHash });
  return out;
}

export async function isSuppressed(points: ContactPoints, tx?: Tx): Promise<boolean> {
  const hashes = hashesFor(points).map((h) => h.hash);
  if (hashes.length === 0) return false;
  const count = await (tx ?? db).suppressionEntry.count({ where: { valueHash: { in: hashes } } });
  return count > 0;
}

export async function addSuppression(
  points: ContactPoints,
  meta: { reason: string; source: string; leadId?: string | null; userId?: string | null },
  tx?: Tx,
): Promise<number> {
  const client = tx ?? db;
  let added = 0;
  for (const { type, hash } of hashesFor(points)) {
    const result = await client.suppressionEntry.upsert({
      where: { valueHash: hash },
      create: { type, valueHash: hash, reason: meta.reason, source: meta.source, leadId: meta.leadId, createdById: meta.userId },
      update: {},
    });
    if (result) added++;
  }
  return added;
}

export async function removeSuppression(points: ContactPoints): Promise<number> {
  const hashes = hashesFor(points).map((h) => h.hash);
  if (hashes.length === 0) return 0;
  const { count } = await db.suppressionEntry.deleteMany({ where: { valueHash: { in: hashes } } });
  return count;
}
