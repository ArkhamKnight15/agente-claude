import "dotenv/config";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { getEnv } from "@/server/env";
import { isImapConfigured } from "@/server/integrations/email";
import { createLogger } from "@/server/logger";
import { enqueueJob, recoverStaleJobs } from "@/server/jobs/queue";
import { runNextJob } from "@/server/jobs/runner";
import { logEvent } from "@/server/services/events";

/**
 * Processo em segundo plano: executa a fila de tarefas (pesquisas, verificações,
 * envios, leitura de respostas) e agenda as rotinas recorrentes.
 * Uso: npm run worker
 */

const log = createLogger("worker");
const env = getEnv();
const workerId = `${hostname()}:${process.pid}:${randomBytes(3).toString("hex")}`;
let stopping = false;
let jobsDone = 0;
const active = new Set<Promise<unknown>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function slot(minutes: number): number {
  return Math.floor(Date.now() / (minutes * 60_000));
}

async function scheduleRecurring() {
  // A chave de idempotência por janela garante uma execução por período, mesmo com vários workers.
  if (isImapConfigured()) {
    await enqueueJob("email.syncInbox", {}, { idempotencyKey: `email.syncInbox:${slot(5)}`, maxAttempts: 1 });
  }
  await enqueueJob("followups.scan", {}, { idempotencyKey: `followups.scan:${slot(60)}`, maxAttempts: 2 });
  const day = new Date().toISOString().slice(0, 10);
  await enqueueJob("maintenance.cleanup", {}, { idempotencyKey: `maintenance.cleanup:${day}`, maxAttempts: 2, runAt: new Date() });
}

async function heartbeat() {
  await db.workerHeartbeat.upsert({
    where: { id: workerId },
    create: { id: workerId, startedAt: new Date(), lastSeenAt: new Date(), hostname: hostname(), jobsDone },
    update: { lastSeenAt: new Date(), jobsDone },
  });
}

async function housekeepingLoop() {
  while (!stopping) {
    try {
      await heartbeat();
      const recovered = await recoverStaleJobs(10);
      if (recovered > 0) {
        await logEvent({ level: "WARN", source: "worker", message: `${recovered} tarefa(s) interrompida(s) devolvida(s) à fila.` });
      }
      await scheduleRecurring();
    } catch (error) {
      log.error("Falha na rotina de manutenção do worker", { error });
    }
    for (let i = 0; i < 15 && !stopping; i++) await sleep(1000);
  }
}

async function processingLoop(lane: number) {
  let idleMs = env.WORKER_POLL_MS;
  while (!stopping) {
    try {
      const run = runNextJob(`${workerId}#${lane}`);
      active.add(run);
      const result = await run.finally(() => active.delete(run));
      if (result) {
        jobsDone++;
        idleMs = env.WORKER_POLL_MS;
        log.info(`Tarefa ${result.job.type} → ${result.outcome}`, { id: result.job.id, lane });
        continue;
      }
    } catch (error) {
      log.error("Erro inesperado no loop de processamento", { error, lane });
    }
    await sleep(idleMs);
    idleMs = Math.min(idleMs * 2, 10_000);
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info(`Recebido ${signal}; aguardando ${active.size} tarefa(s) em execução…`);
  await Promise.race([Promise.allSettled([...active]), sleep(30_000)]);
  await db.workerHeartbeat.delete({ where: { id: workerId } }).catch(() => undefined);
  await db.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

async function main() {
  log.info(`Worker ${workerId} iniciado com ${env.WORKER_CONCURRENCY} faixa(s) de execução.`);
  await heartbeat();
  await logEvent({ source: "worker", message: `Worker iniciado (${hostname()}).` });
  const lanes = Array.from({ length: Math.max(1, env.WORKER_CONCURRENCY) }, (_, i) => processingLoop(i + 1));
  await Promise.all([housekeepingLoop(), ...lanes]);
}

main().catch(async (error) => {
  log.error("Worker encerrado por erro fatal", { error });
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
