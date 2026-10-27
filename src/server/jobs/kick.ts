import { after } from "next/server";
import { getEnv } from "@/server/env";
import { createLogger } from "@/server/logger";
import { runServerlessCycle } from "@/server/jobs/scheduler";

const log = createLogger("jobs.kick");

/**
 * Em hospedagem serverless (QUEUE_INLINE, ativo por padrão na Vercel) não há worker contínuo:
 * logo após responder ao usuário, processa as tarefas pendentes por alguns segundos.
 * Com worker dedicado (npm run worker) não faz nada.
 */
export function kickQueue(budgetMs = 60_000): void {
  if (!getEnv().QUEUE_INLINE) return;
  try {
    after(async () => {
      try {
        await runServerlessCycle(budgetMs, "inline");
      } catch (error) {
        log.error("Falha ao processar a fila após a ação", { error });
      }
    });
  } catch (error) {
    // Fora do contexto de requisição (ex.: scripts): o cron processa depois.
    log.warn("Fila não disparada fora de uma requisição", { error });
  }
}
