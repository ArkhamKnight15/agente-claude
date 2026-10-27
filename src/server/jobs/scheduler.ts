import { hostname } from "node:os";
import { db } from "@/server/db";
import { isImapConfigured } from "@/server/integrations/email";
import { enqueueJob, recoverStaleJobs } from "@/server/jobs/queue";
import { runNextJob } from "@/server/jobs/runner";
import { logEvent } from "@/server/services/events";

/**
 * Rotinas compartilhadas entre o worker contínuo (npm run worker) e a execução
 * sob demanda em plataformas serverless (cron da Vercel / execução após ações).
 */

function slot(minutes: number): number {
  return Math.floor(Date.now() / (minutes * 60_000));
}

/** Agenda as rotinas recorrentes. A chave por janela evita duplicidade entre execuções. */
export async function scheduleRecurring(): Promise<void> {
  if (isImapConfigured()) {
    await enqueueJob("email.syncInbox", {}, { idempotencyKey: `email.syncInbox:${slot(5)}`, maxAttempts: 1 });
  }
  await enqueueJob("followups.scan", {}, { idempotencyKey: `followups.scan:${slot(60)}`, maxAttempts: 2 });
  const day = new Date().toISOString().slice(0, 10);
  await enqueueJob("maintenance.cleanup", {}, { idempotencyKey: `maintenance.cleanup:${day}`, maxAttempts: 2 });
}

export async function heartbeat(workerId: string, jobsDone: number, host = hostname()): Promise<void> {
  // No modo cron cada execução soma suas tarefas; o worker contínuo informa o total acumulado.
  const cron = workerId.startsWith("cron:");
  await db.workerHeartbeat.upsert({
    where: { id: workerId },
    create: { id: workerId, startedAt: new Date(), lastSeenAt: new Date(), hostname: host, jobsDone },
    update: { lastSeenAt: new Date(), hostname: host, jobsDone: cron ? { increment: jobsDone } : jobsDone },
  });
}

/** Worker contínuo envia sinal a cada 15 s; o modo cron, a cada execução agendada. */
export function isWorkerOnline(hb: { id: string; lastSeenAt: Date } | null | undefined, now = Date.now()): boolean {
  if (!hb) return false;
  const limit = hb.id.startsWith("cron:") ? 15 * 60_000 : 60_000;
  return now - hb.lastSeenAt.getTime() < limit;
}

/** Processa tarefas até acabar a fila ou o tempo disponível (não inicia novas após o prazo). */
export async function runJobsFor(budgetMs: number, workerId: string): Promise<{ processed: number; outcomes: Record<string, number> }> {
  const deadline = Date.now() + budgetMs;
  const outcomes: Record<string, number> = {};
  let processed = 0;
  while (Date.now() < deadline) {
    const result = await runNextJob(workerId);
    if (!result) break;
    processed++;
    outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
  }
  return { processed, outcomes };
}

/** Um ciclo completo em modo serverless: manutenção + processamento com prazo. */
export async function runServerlessCycle(budgetMs: number, source: string) {
  const workerId = `cron:${source}`;
  const recovered = await recoverStaleJobs(10);
  if (recovered > 0) await logEvent({ level: "WARN", source: "worker", message: `${recovered} tarefa(s) interrompida(s) devolvida(s) à fila.` });
  await scheduleRecurring();
  const result = await runJobsFor(budgetMs, workerId);
  await heartbeat(workerId, result.processed, source);
  return { ...result, recovered };
}
