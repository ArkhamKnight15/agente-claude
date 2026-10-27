import type { Job, Prisma } from "@/generated/prisma/client";
import { processInboundMessage } from "@/server/agent/reply-handler";
import { db } from "@/server/db";
import { fetchNewEmails, isImapConfigured, type ImapState } from "@/server/integrations/email";
import { rescheduleJob } from "@/server/jobs/queue";
import { logEvent } from "@/server/services/events";
import { markSendFailed, performSend, recordInboundEmail } from "@/server/services/messages";

/** Etapa 8: envio das mensagens aprovadas pelas integrações habilitadas. */
export async function handleMessageSend(job: Job): Promise<Prisma.InputJsonValue | "rescheduled"> {
  const { messageId } = job.payload as { messageId: string };
  try {
    const outcome = await performSend(messageId);
    if (outcome.status === "deferred") {
      await rescheduleJob(job, outcome.until, "Fora da janela de envio; reagendado.");
      return "rescheduled";
    }
    return outcome;
  } catch (error) {
    // Última tentativa: registra a falha na mensagem para aparecer na Central de mensagens.
    if (job.attempts >= job.maxAttempts) await markSendFailed(messageId, error);
    throw error;
  }
}

/** Etapas 10–11: identificar interessados e atualizar o CRM. */
export async function handleInboundProcess(job: Job): Promise<Prisma.InputJsonValue> {
  const { messageId } = job.payload as { messageId: string };
  const result = await processInboundMessage(messageId);
  return result as unknown as Prisma.InputJsonValue;
}

const IMAP_STATE_KEY = "imapState";

/** Lê respostas na caixa de entrada (IMAP) e as associa aos leads. */
export async function handleEmailSync(): Promise<Prisma.InputJsonValue> {
  if (!isImapConfigured()) return { skipped: "IMAP não configurado" };
  const row = await db.appSetting.findUnique({ where: { key: IMAP_STATE_KEY } });
  const state = (row?.value as ImapState | undefined) ?? { uidValidity: null, lastUid: 0 };
  const { emails, state: next } = await fetchNewEmails(state);
  let matched = 0;
  for (const email of emails) {
    const message = await recordInboundEmail(email);
    if (message) matched++;
  }
  await db.appSetting.upsert({
    where: { key: IMAP_STATE_KEY },
    create: { key: IMAP_STATE_KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  if (emails.length) {
    await logEvent({ source: "email.sync", message: `${emails.length} e-mail(s) lido(s); ${matched} associado(s) a leads.` });
  }
  return { read: emails.length, matched };
}
