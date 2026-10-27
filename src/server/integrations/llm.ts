import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { getEnv } from "@/server/env";
import { IntegrationError, IntegrationNotConfiguredError } from "@/server/errors";
import { createLogger } from "@/server/logger";

/**
 * Modelo de linguagem configurável (Claude API). Modelo e esforço vêm de LLM_MODEL e
 * LLM_EFFORT. A chave fica só no servidor (ANTHROPIC_API_KEY).
 */

const log = createLogger("llm");

export function isLlmConfigured(): boolean {
  return Boolean(getEnv().ANTHROPIC_API_KEY);
}

export function llmModel(): string {
  return getEnv().LLM_MODEL;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const env = getEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new IntegrationNotConfiguredError("IA (Claude API)", "Defina ANTHROPIC_API_KEY para usar a IA.");
  }
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
  return client;
}

export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  prompt: string;
  schema: S;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function mapError(error: unknown): never {
  if (error instanceof IntegrationError || error instanceof IntegrationNotConfiguredError) throw error;
  if (error instanceof Anthropic.AuthenticationError) {
    throw new IntegrationError("IA (Claude API)", "Chave da Claude API inválida (ANTHROPIC_API_KEY).", false, "401");
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    throw new IntegrationError("IA (Claude API)", "A chave não tem permissão para este modelo.", false, "403");
  }
  if (error instanceof Anthropic.NotFoundError) {
    throw new IntegrationError("IA (Claude API)", `Modelo não encontrado: ${llmModel()} (LLM_MODEL).`, false, "404");
  }
  if (error instanceof Anthropic.RateLimitError) {
    throw new IntegrationError("IA (Claude API)", "Limite de uso da Claude API atingido. Tentaremos novamente.", true, "429");
  }
  if (error instanceof Anthropic.BadRequestError) {
    throw new IntegrationError("IA (Claude API)", `Requisição rejeitada pela Claude API: ${error.message}`, false, "400");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    throw new IntegrationError("IA (Claude API)", "Falha de conexão com a Claude API.", true, "CONNECTION");
  }
  if (error instanceof Anthropic.APIError) {
    throw new IntegrationError("IA (Claude API)", `Erro da Claude API (${error.status}).`, (error.status ?? 500) >= 500, String(error.status));
  }
  throw new IntegrationError("IA (Claude API)", `Erro inesperado na IA: ${(error as Error).message}`, true);
}

/** Gera uma resposta JSON validada pelo schema Zod. */
export async function generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
  const env = getEnv();
  try {
    const response = await getClient().beta.messages.parse({
      model: env.LLM_MODEL,
      max_tokens: req.maxTokens ?? 8000,
      // Em caso de recusa por política, o servidor tenta o modelo substituto recomendado.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        format: betaZodOutputFormat(req.schema),
        effort: req.effort ?? env.LLM_EFFORT,
      },
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
    });

    if (response.stop_reason === "refusal") {
      throw new IntegrationError("IA (Claude API)", "O modelo recusou esta solicitação.", false, "refusal");
    }
    if (response.stop_reason === "max_tokens") {
      throw new IntegrationError("IA (Claude API)", "Resposta da IA truncada (limite de tokens).", false, "max_tokens");
    }
    if (!response.parsed_output) {
      throw new IntegrationError("IA (Claude API)", "A IA respondeu fora do formato esperado.", true, "invalid_output");
    }
    log.debug("Resposta estruturada", {
      model: response.model,
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    });
    return {
      data: response.parsed_output as z.infer<S>,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    mapError(error);
  }
}

/** Chamada mínima para validar a configuração (botão "Testar conexão"). */
export async function pingLlm(): Promise<string> {
  try {
    const response = await getClient().messages.create({
      model: llmModel(),
      max_tokens: 64,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Responda apenas: OK" }],
    });
    return response.model;
  } catch (error) {
    mapError(error);
  }
}
