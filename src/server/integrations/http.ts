import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import type { FetchedPage } from "@/lib/agent/website-analysis";
import { IntegrationError } from "@/server/errors";

export const USER_AGENT = "ProspectaBot/0.1 (+verificacao de presenca digital; respeita robots e limites)";

// ───────────────────────────── Proteção contra SSRF ─────────────────────────────

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower.startsWith("::ffff:127.") ||
    lower.startsWith("::ffff:10.") ||
    lower.startsWith("::ffff:192.168.")
  );
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function safeLookup(hostname: string, options: object, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    const blocked = list.find((a) => isPrivateAddress(a.address));
    if (blocked) {
      const error = new Error(`Endereço bloqueado por segurança: ${hostname}`) as NodeJS.ErrnoException;
      error.code = "EBLOCKED";
      return callback(error, []);
    }
    const wantsAll = (options as { all?: boolean }).all;
    if (wantsAll) return callback(null, list);
    const first = list[0];
    return callback(null, first.address, first.family);
  });
}

const publicWebAgent = new Agent({
  connect: { lookup: safeLookup as never, timeout: 8000 },
});

// ───────────────────────────── APIs JSON ─────────────────────────────

export interface JsonRequest {
  integration: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface JsonResponse<T> {
  status: number;
  data: T;
}

/** Chamada a APIs oficiais. Erros viram IntegrationError com indicação de retentativa. */
export async function requestJson<T>(url: string, req: JsonRequest): Promise<JsonResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 20000);
  try {
    const response = await fetch(url, {
      method: req.method ?? "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...req.headers,
      },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    return { status: response.status, data: data as T };
  } catch (error) {
    const aborted = (error as Error).name === "AbortError";
    throw new IntegrationError(
      req.integration,
      aborted ? "Tempo limite excedido ao chamar a API." : `Falha de conexão com a API: ${(error as Error).message}`,
      true,
      aborted ? "TIMEOUT" : "CONNECTION",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Classifica status HTTP de APIs: 429 e 5xx são temporários. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

// ───────────────────────────── Páginas públicas ─────────────────────────────

function mapFetchError(error: unknown): Pick<FetchedPage, "errorCode" | "errorMessage"> {
  const err = error as Error & { cause?: { code?: string; message?: string }; code?: string };
  const code = err.cause?.code ?? err.code ?? "";
  if (err.name === "AbortError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") {
    return { errorCode: "TIMEOUT", errorMessage: "O site demorou demais para responder." };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return { errorCode: "DNS", errorMessage: "O domínio não existe ou não está configurado (DNS)." };
  }
  if (code === "EBLOCKED") return { errorCode: "BLOCKED", errorMessage: "Endereço bloqueado por segurança." };
  if (/CERT|SSL|TLS/i.test(code) || /certificate/i.test(err.cause?.message ?? "")) {
    return { errorCode: "TLS", errorMessage: "Certificado HTTPS inválido ou expirado." };
  }
  return { errorCode: "CONNECTION", errorMessage: `Não foi possível conectar ao site (${code || err.message}).` };
}

async function readLimited(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Baixa a página inicial de um site público com limites de tempo, tamanho e redirecionamentos,
 * bloqueando endereços internos (SSRF).
 */
export async function fetchPublicPage(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {},
): Promise<FetchedPage> {
  const started = Date.now();
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = rawUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12000);

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const url = new URL(current);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { requestedUrl: rawUrl, finalUrl: current, status: null, html: null, responseMs: Date.now() - started, errorCode: "BLOCKED", errorMessage: "Protocolo não permitido." };
      }
      if (url.port && url.port !== "80" && url.port !== "443") {
        return { requestedUrl: rawUrl, finalUrl: current, status: null, html: null, responseMs: Date.now() - started, errorCode: "BLOCKED", errorMessage: "Porta não permitida." };
      }
      const response = await undiciFetch(current, {
        method: "GET",
        redirect: "manual",
        dispatcher: publicWebAgent,
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      } as UndiciRequestInit);

      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        await response.body?.cancel();
        current = new URL(response.headers.get("location")!, current).toString();
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!/html|xml|text\/plain/i.test(contentType)) {
        await response.body?.cancel();
        return { requestedUrl: rawUrl, finalUrl: current, status: response.status, html: null, responseMs: Date.now() - started, errorCode: "NOT_HTML", errorMessage: `Conteúdo não é uma página (${contentType || "desconhecido"}).` };
      }
      const html = await readLimited(response.body as ReadableStream<Uint8Array> | null, opts.maxBytes ?? 1_500_000);
      return { requestedUrl: rawUrl, finalUrl: current, status: response.status, html, responseMs: Date.now() - started };
    }
    return { requestedUrl: rawUrl, finalUrl: current, status: null, html: null, responseMs: Date.now() - started, errorCode: "CONNECTION", errorMessage: "Redirecionamentos em excesso." };
  } catch (error) {
    return { requestedUrl: rawUrl, finalUrl: current, status: null, html: null, responseMs: Date.now() - started, ...mapFetchError(error) };
  } finally {
    clearTimeout(timer);
  }
}

export const __test = { isPrivateAddress };
