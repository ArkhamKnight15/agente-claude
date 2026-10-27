import { after, NextResponse } from "next/server";
import { getEnv } from "@/server/env";
import { createLogger } from "@/server/logger";
import { runServerlessCycle } from "@/server/jobs/scheduler";
import { safeEqual } from "@/server/security/crypto";

/**
 * Processa a fila de tarefas em hospedagem serverless (Vercel), sem worker contínuo.
 * Chamado pelo Cron da Vercel ou por um agendador externo com o cabeçalho
 * "Authorization: Bearer <CRON_SECRET>". Responde na hora e processa em segundo plano.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = createLogger("cron");
// Margem para a tarefa em andamento terminar antes do limite da função.
const BUDGET_MS = (maxDuration - 75) * 1000;

export async function GET(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Defina CRON_SECRET para habilitar este endpoint." }, { status: 503 });
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // ?wait=1 executa e devolve o resultado (útil para diagnóstico manual).
  if (new URL(request.url).searchParams.get("wait") === "1") {
    const result = await runServerlessCycle(BUDGET_MS, "cron");
    return NextResponse.json({ ok: true, ...result });
  }
  after(async () => {
    try {
      const result = await runServerlessCycle(BUDGET_MS, "cron");
      log.info("Ciclo de tarefas concluído", result);
    } catch (error) {
      log.error("Falha no ciclo de tarefas", { error });
    }
  });
  return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
}

export const POST = GET;
