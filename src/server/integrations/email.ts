import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getEnv } from "@/server/env";
import { IntegrationError, IntegrationNotConfiguredError } from "@/server/errors";

/** Envio por SMTP (qualquer provedor) e leitura de respostas por IMAP. */

export function isSmtpConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.EMAIL_FROM);
}

export function isImapConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.IMAP_HOST && env.IMAP_USER && env.IMAP_PASSWORD);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  const env = getEnv();
  if (!isSmtpConfigured()) {
    throw new IntegrationNotConfiguredError("E-mail (SMTP)", "Defina SMTP_HOST, SMTP_USER, SMTP_PASSWORD e EMAIL_FROM.");
  }
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
  return transporter;
}

function senderDomain(): string {
  const from = getEnv().EMAIL_FROM ?? "";
  return from.match(/@([^>\s]+)/)?.[1] ?? "localhost";
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  unsubscribeUrl: string;
  inReplyTo?: string | null;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

export async function sendEmail(email: OutgoingEmail): Promise<{ providerMessageId: string }> {
  const env = getEnv();
  const messageId = `<${randomUUID()}@${senderDomain()}>`;
  try {
    const info = await getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to: email.to,
      replyTo: env.EMAIL_REPLY_TO ?? undefined,
      subject: email.subject,
      text: email.text,
      messageId,
      inReplyTo: email.inReplyTo ?? undefined,
      references: email.inReplyTo ?? undefined,
      attachments: email.attachments,
      headers: {
        "List-Unsubscribe": `<${email.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (info.rejected?.length) {
      throw new IntegrationError("E-mail (SMTP)", `Destinatário recusado pelo servidor: ${info.rejected.join(", ")}`, false);
    }
    return { providerMessageId: info.messageId ?? messageId };
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    const err = error as Error & { responseCode?: number; code?: string };
    // Códigos SMTP 4xx e falhas de rede são temporários; 5xx e autenticação, não.
    const retryable = err.code !== "EAUTH" && (!err.responseCode || (err.responseCode >= 400 && err.responseCode < 500));
    throw new IntegrationError(
      "E-mail (SMTP)",
      err.code === "EAUTH" ? "Falha de autenticação no SMTP — verifique usuário e senha (ou senha de app)." : `Falha no envio: ${err.message}`,
      retryable,
      err.code ?? (err.responseCode ? String(err.responseCode) : undefined),
    );
  }
}

export async function verifySmtp(): Promise<void> {
  try {
    await getTransporter().verify();
  } catch (error) {
    if (error instanceof IntegrationNotConfiguredError) throw error;
    throw new IntegrationError("E-mail (SMTP)", `Não foi possível conectar ao SMTP: ${(error as Error).message}`, false);
  }
}

export interface InboundEmail {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string | null;
  subject: string;
  text: string;
  date: Date;
}

export interface ImapState {
  uidValidity: string | null;
  lastUid: number;
}

function createImapClient() {
  const env = getEnv();
  if (!isImapConfigured()) {
    throw new IntegrationNotConfiguredError("E-mail (IMAP)", "Defina IMAP_HOST, IMAP_USER e IMAP_PASSWORD.");
  }
  return new ImapFlow({
    host: env.IMAP_HOST!,
    port: env.IMAP_PORT,
    secure: env.IMAP_SECURE,
    auth: { user: env.IMAP_USER!, pass: env.IMAP_PASSWORD! },
    logger: false,
  });
}

/** Busca mensagens novas desde o último UID processado (máx. `limit` por execução). */
export async function fetchNewEmails(state: ImapState, limit = 50): Promise<{ emails: InboundEmail[]; state: ImapState }> {
  const client = createImapClient();
  const mailbox = getEnv().IMAP_MAILBOX;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      const status = client.mailbox;
      const uidValidity = status && typeof status === "object" ? String(status.uidValidity) : null;
      // Se o UIDVALIDITY mudou, reiniciamos a partir de agora para não reprocessar a caixa inteira.
      const startUid = state.uidValidity && state.uidValidity === uidValidity ? state.lastUid + 1 : null;
      const range = startUid ? `${startUid}:*` : null;
      const emails: InboundEmail[] = [];
      let lastUid = state.uidValidity === uidValidity ? state.lastUid : 0;

      if (!range) {
        const uidNext = status && typeof status === "object" ? Number(status.uidNext ?? 1) : 1;
        return { emails: [], state: { uidValidity, lastUid: Math.max(0, uidNext - 1) } };
      }
      for await (const msg of client.fetch(range, { uid: true, source: true }, { uid: true })) {
        if (msg.uid < (startUid ?? 0)) continue; // "N:*" retorna a última mensagem se não houver novas
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const refs = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
        emails.push({
          uid: msg.uid,
          messageId: parsed.messageId ?? null,
          inReplyTo: parsed.inReplyTo ?? null,
          references: refs,
          from: parsed.from?.value?.[0]?.address?.toLowerCase() ?? null,
          subject: parsed.subject ?? "",
          text: (parsed.text ?? "").slice(0, 20_000),
          date: parsed.date ?? new Date(),
        });
        lastUid = Math.max(lastUid, msg.uid);
        if (emails.length >= limit) break;
      }
      return { emails, state: { uidValidity, lastUid } };
    } finally {
      lock.release();
    }
  } catch (error) {
    if (error instanceof IntegrationNotConfiguredError) throw error;
    throw new IntegrationError("E-mail (IMAP)", `Falha ao ler a caixa de entrada: ${(error as Error).message}`, true);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function verifyImap(): Promise<void> {
  const client = createImapClient();
  try {
    await client.connect();
  } catch (error) {
    throw new IntegrationError("E-mail (IMAP)", `Não foi possível conectar ao IMAP: ${(error as Error).message}`, false);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** Remove o histórico citado ("Em ... escreveu:") para classificar só a resposta nova. */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^>/.test(line)) break;
    if (/^(Em|On) .{5,120}(escreveu|wrote):?\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*(Mensagem original|Original Message)/i.test(line.trim())) break;
    if (/^De: .+/i.test(line.trim()) && out.length > 0) break;
    out.push(line);
  }
  return out.join("\n").trim();
}
