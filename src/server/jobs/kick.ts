import { after } from "next/server";
import { getEnv } from "@/server/env";
import { createLogger } from "@/server/logger";
import { hasPendingWork } from "@/server/jobs/queue";
import { runServerlessCycle, SERVERLESS_BUDGET_MS, SERVERLESS_STALE_MINUTES } from "@/server/jobs/scheduler";
import { hitRateLimit } from "@/server/security/rate-limit";

const log = createLogger("jobs.kick");

/**
 * Em hospedagem serverless (QUEUE_INLINE, ativo por padrão na Vercel) não há worker contínuo:
 * logo após responder ao usuário, processa as tarefas pendentes por alguns minutos.
 * Com worker dedicado (npm run worker) não faz nada.
 */
export function kickQueue(budgetMs = SERVERLESS_BUDGET_MS): void {
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

/**
 * Mantém a fila andando enquanto alguém usa o sistema, sem depender do agendador externo:
 * chamado a cada carregamento de página (as telas em andamento se atualizam sozinhas),
 * inicia no máximo um ciclo por janela e só quando há tarefa pendente.
 */
export async function kickQueueIfPending(): Promise<boolean> {
  if (!getEnv().QUEUE_INLINE) return false;
  try {
    if (!(await hasPendingWork(SERVERLESS_STALE_MINUTES))) return false;
    const window = await hitRateLimit("queue:inline-cycle", 1, SERVERLESS_BUDGET_MS / 1000);
    if (!window.allowed) return false;
    kickQueue();
    return true;
  } catch (error) {
    log.warn("Não foi possível verificar a fila", { error });
    return false;
  }
}
