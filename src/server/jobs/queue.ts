import type { Job, Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";
import { errorMessage, isRetryable } from "@/server/errors";

/**
 * Fila de tarefas persistida no PostgreSQL.
 * - Claim atômico com FOR UPDATE SKIP LOCKED (vários workers em paralelo).
 * - idempotencyKey evita tarefas duplicadas (ex.: processar o mesmo lead duas vezes).
 * - Jobs de campanhas pausadas/canceladas não são executados.
 * - Jobs travados por queda do worker voltam para a fila (retomada após falhas).
 */

export type JobType =
  | "campaign.search"
  | "lead.process"
  | "campaign.finalize"
  | "message.send"
  | "inbound.process"
  | "email.syncInbox"
  | "followups.scan"
  | "maintenance.cleanup";

export interface EnqueueOptions {
  runAt?: Date;
  priority?: number;
  maxAttempts?: number;
  idempotencyKey?: string;
  campaignId?: string | null;
  leadId?: string | null;
}

export async function enqueueJob(
  type: JobType,
  payload: Prisma.InputJsonValue,
  opts: EnqueueOptions = {},
  tx?: Tx,
): Promise<Job> {
  const client = tx ?? db;
  const data = {
    type,
    payload,
    runAt: opts.runAt ?? new Date(),
    priority: opts.priority ?? 0,
    maxAttempts: opts.maxAttempts ?? 3,
    campaignId: opts.campaignId ?? null,
    leadId: opts.leadId ?? null,
    idempotencyKey: opts.idempotencyKey ?? null,
  };
  if (!opts.idempotencyKey) return client.job.create({ data });
  return client.job.upsert({ where: { idempotencyKey: opts.idempotencyKey }, create: data, update: {} });
}

export async function claimNextJob(workerId: string, types?: JobType[]): Promise<Job | null> {
  const typeFilter = types?.length ? types : null;
  const rows = await db.$queryRaw<Job[]>`
    UPDATE "Job" SET
      "status" = 'RUNNING',
      "lockedAt" = now(),
      "lockedBy" = ${workerId},
      "startedAt" = now(),
      "attempts" = "attempts" + 1,
      "updatedAt" = now()
    WHERE "id" = (
      SELECT j."id" FROM "Job" j
      LEFT JOIN "Campaign" c ON c."id" = j."campaignId"
      WHERE j."status" = 'QUEUED'
        AND j."runAt" <= now()
        AND (j."campaignId" IS NULL OR c."status" = 'RUNNING')
        AND (${typeFilter}::text[] IS NULL OR j."type" = ANY(${typeFilter}::text[]))
      ORDER BY j."priority" DESC, j."runAt" ASC
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function completeJob(jobId: string, result?: Prisma.InputJsonValue): Promise<void> {
  await db.job.update({
    where: { id: jobId },
    data: { status: "SUCCEEDED", finishedAt: new Date(), lockedAt: null, lockedBy: null, result, lastError: null },
  });
}

/** Reagenda o mesmo job (ex.: aguardar janela de envio) sem contar como tentativa. */
export async function rescheduleJob(job: Job, runAt: Date, note?: string): Promise<void> {
  await db.job.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      runAt,
      lockedAt: null,
      lockedBy: null,
      attempts: Math.max(0, job.attempts - 1),
      lastError: note ?? null,
    },
  });
}

export function backoffMs(attempt: number): number {
  return Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

export async function failJob(job: Job, error: unknown): Promise<"retry" | "failed"> {
  const message = errorMessage(error).slice(0, 2000);
  const retry = isRetryable(error) && job.attempts < job.maxAttempts;
  await db.job.update({
    where: { id: job.id },
    data: retry
      ? { status: "QUEUED", runAt: new Date(Date.now() + backoffMs(job.attempts)), lockedAt: null, lockedBy: null, lastError: message }
      : { status: "FAILED", finishedAt: new Date(), lockedAt: null, lockedBy: null, lastError: message },
  });
  return retry ? "retry" : "failed";
}

/** Devolve à fila os jobs cujo worker caiu no meio da execução. */
export async function recoverStaleJobs(staleMinutes = 10): Promise<number> {
  const requeued = await db.$executeRaw`
    UPDATE "Job" SET "status" = 'QUEUED', "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = now(),
      "lastError" = 'Execução interrompida (worker reiniciado ou travado); tarefa retomada.'
    WHERE "status" = 'RUNNING' AND "lockedAt" < now() - make_interval(mins => ${staleMinutes})
      AND "attempts" < "maxAttempts"
  `;
  const failed = await db.$executeRaw`
    UPDATE "Job" SET "status" = 'FAILED', "lockedAt" = NULL, "lockedBy" = NULL, "finishedAt" = now(), "updatedAt" = now(),
      "lastError" = 'Execução interrompida repetidamente; limite de tentativas atingido.'
    WHERE "status" = 'RUNNING' AND "lockedAt" < now() - make_interval(mins => ${staleMinutes})
      AND "attempts" >= "maxAttempts"
  `;
  return requeued + failed;
}

export async function cancelQueuedCampaignJobs(campaignId: string, tx?: Tx): Promise<number> {
  const { count } = await (tx ?? db).job.updateMany({
    where: { campaignId, status: "QUEUED" },
    data: { status: "CANCELLED", finishedAt: new Date(), lastError: "Campanha cancelada pelo usuário." },
  });
  return count;
}

export async function retryJob(jobId: string): Promise<void> {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status !== "FAILED" && job.status !== "CANCELLED") return;
  await db.job.update({
    where: { id: jobId },
    data: { status: "QUEUED", runAt: new Date(), maxAttempts: job.attempts + 1, finishedAt: null, lastError: null },
  });
}

export async function pendingJobCount(campaignId: string, types?: JobType[]): Promise<number> {
  return db.job.count({
    where: { campaignId, status: { in: ["QUEUED", "RUNNING"] }, ...(types ? { type: { in: types } } : {}) },
  });
}
