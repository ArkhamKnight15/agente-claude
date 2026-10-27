import type { Job } from "@/generated/prisma/client";
import { errorMessage } from "@/server/errors";
import { createLogger } from "@/server/logger";
import { claimNextJob, completeJob, failJob, type JobType } from "@/server/jobs/queue";
import { JOB_HANDLERS } from "@/server/jobs/registry";
import { logEvent } from "@/server/services/events";

const log = createLogger("jobs");

/** Executa um job já reivindicado, registrando sucesso, retentativa ou falha. */
export async function runJob(job: Job): Promise<"succeeded" | "retry" | "failed" | "rescheduled"> {
  const handler = JOB_HANDLERS[job.type as JobType];
  if (!handler) {
    await failJob(job, new Error(`Tipo de tarefa desconhecido: ${job.type}`));
    return "failed";
  }
  const started = Date.now();
  try {
    const result = await handler(job);
    if (result === "rescheduled") return "rescheduled";
    await completeJob(job.id, result);
    log.debug("Tarefa concluída", { type: job.type, id: job.id, ms: Date.now() - started });
    return "succeeded";
  } catch (error) {
    const outcome = await failJob(job, error);
    await logEvent({
      level: outcome === "failed" ? "ERROR" : "WARN",
      source: job.type,
      message: `${outcome === "failed" ? "Falhou" : `Tentativa ${job.attempts}/${job.maxAttempts} falhou`}: ${errorMessage(error)}`,
      jobId: job.id,
      campaignId: job.campaignId,
      leadId: job.leadId,
    });
    return outcome;
  }
}

/** Reivindica e executa o próximo job disponível. Usado pelo worker e pelos testes. */
export async function runNextJob(workerId: string, types?: JobType[]): Promise<{ job: Job; outcome: Awaited<ReturnType<typeof runJob>> } | null> {
  const job = await claimNextJob(workerId, types);
  if (!job) return null;
  const outcome = await runJob(job);
  return { job, outcome };
}
