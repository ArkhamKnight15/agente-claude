import type { Prisma } from "@/generated/prisma/client";
import type { LogLevel } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { createLogger } from "@/server/logger";

const log = createLogger("events");

export interface EventInput {
  level?: LogLevel;
  source: string;
  message: string;
  details?: Prisma.InputJsonValue;
  jobId?: string | null;
  campaignId?: string | null;
  leadId?: string | null;
}

/** Registro persistente exibido em "Histórico de tarefas e erros". */
export async function logEvent(input: EventInput): Promise<void> {
  const level = input.level ?? "INFO";
  const ctx = { source: input.source, jobId: input.jobId, campaignId: input.campaignId, leadId: input.leadId };
  if (level === "ERROR") log.error(input.message, ctx);
  else if (level === "WARN") log.warn(input.message, ctx);
  else log.info(input.message, ctx);
  try {
    await db.eventLog.create({
      data: {
        level,
        source: input.source,
        message: input.message.slice(0, 2000),
        details: input.details,
        jobId: input.jobId ?? null,
        campaignId: input.campaignId ?? null,
        leadId: input.leadId ?? null,
      },
    });
  } catch (error) {
    log.error("Falha ao gravar evento", { error });
  }
}
