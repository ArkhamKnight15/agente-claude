import { z } from "zod";
import { AppError } from "@/server/errors";
import { createLogger } from "@/server/logger";

const log = createLogger("actions");

export interface ActionState {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Dados extras para a interface (ex.: id criado, resultados de busca). */
  data?: unknown;
  /** Muda a cada execução para que a interface reaja mesmo com mensagem igual. */
  at?: number;
}

export const initialActionState: ActionState = {};

/** Executa a ação convertendo erros de domínio em mensagens seguras para o usuário. */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const result = (await fn()) ?? { ok: true };
    return { ...result, at: Date.now() };
  } catch (error) {
    // redirect() e notFound() do Next lançam exceções especiais que devem seguir adiante.
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_")) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: "Verifique os campos destacados.", fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>, at: Date.now() };
    }
    if (error instanceof AppError) return { ok: false, error: error.message, at: Date.now() };
    log.error("Erro inesperado em ação", { error });
    return { ok: false, error: "Ocorreu um erro inesperado. Tente novamente — se persistir, veja Tarefas e erros.", at: Date.now() };
  }
}

export function str(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function optStr(fd: FormData, name: string): string | null {
  const value = str(fd, name);
  return value ? value : null;
}

export function bool(fd: FormData, name: string): boolean {
  const value = fd.get(name);
  return value === "on" || value === "true" || value === "1";
}

export function lines(fd: FormData, name: string): string[] {
  return str(fd, name)
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}
