import { db } from "@/server/db";
import { verifySignedToken } from "@/server/security/crypto";
import { markDoNotContact } from "@/server/services/leads";

/** Descadastro pelo link do e-mail. Idempotente e sem expor dados do lead. */
export async function unsubscribeByToken(token: string): Promise<"done" | "invalid"> {
  const payload = verifySignedToken(token, "unsubscribe");
  if (!payload?.l) return "invalid";
  const lead = await db.lead.findUnique({ where: { id: payload.l }, select: { id: true, doNotContact: true } });
  // Lead já excluído: o contato já está na lista de supressão.
  if (!lead || lead.doNotContact) return "done";
  await markDoNotContact(lead.id, { reason: "Descadastro pelo link do e-mail.", source: "EMAIL_UNSUBSCRIBE", actorType: "SYSTEM" });
  return "done";
}
