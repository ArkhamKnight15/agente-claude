import { getEnv } from "@/server/env";
import { IntegrationError, IntegrationNotConfiguredError } from "@/server/errors";
import { isRetryableStatus, requestJson } from "@/server/integrations/http";
import { consumeQuota } from "@/server/services/usage";

/**
 * Busca web para confirmar se a empresa tem site próprio. Provedores oficiais (com chave):
 * - Brave Search API — https://api-dashboard.search.brave.com
 * - Serper.dev (resultados do Google) — https://serper.dev
 * - Google Programmable Search (Custom Search JSON API) — legado; o Google anunciou o
 *   encerramento para novos clientes, use apenas se você já tiver acesso.
 */

export interface WebResult {
  url: string;
  title: string;
  snippet: string;
}

export interface WebSearchProvider {
  id: "brave" | "serper" | "google_cse";
  label: string;
  search(query: string): Promise<WebResult[]>;
}

function fail(provider: string, status: number, detail?: string): never {
  throw new IntegrationError(
    provider,
    `${provider} respondeu HTTP ${status}${detail ? `: ${detail}` : ""}${status === 401 || status === 403 ? " (verifique a chave de API)" : ""}.`,
    isRetryableStatus(status),
  );
}

const brave: WebSearchProvider = {
  id: "brave",
  label: "Brave Search API",
  async search(query) {
    const key = getEnv().BRAVE_SEARCH_API_KEY;
    if (!key) throw new IntegrationNotConfiguredError("Brave Search", "Defina BRAVE_SEARCH_API_KEY.");
    const params = new URLSearchParams({ q: query, country: "BR", search_lang: "pt-br", count: "10", safesearch: "moderate" });
    const { status, data } = await requestJson<{ web?: { results?: Array<{ url: string; title: string; description?: string }> }; message?: string }>(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      { integration: "Brave Search", headers: { "X-Subscription-Token": key } },
    );
    if (status !== 200) fail("Brave Search", status, data?.message);
    return (data?.web?.results ?? []).map((r) => ({ url: r.url, title: r.title ?? "", snippet: r.description ?? "" }));
  },
};

const serper: WebSearchProvider = {
  id: "serper",
  label: "Serper (Google)",
  async search(query) {
    const key = getEnv().SERPER_API_KEY;
    if (!key) throw new IntegrationNotConfiguredError("Serper", "Defina SERPER_API_KEY.");
    const { status, data } = await requestJson<{ organic?: Array<{ link: string; title: string; snippet?: string }>; message?: string }>(
      "https://google.serper.dev/search",
      { integration: "Serper", method: "POST", headers: { "X-API-KEY": key }, body: { q: query, gl: "br", hl: "pt-br", num: 10 } },
    );
    if (status !== 200) fail("Serper", status, data?.message);
    return (data?.organic ?? []).map((r) => ({ url: r.link, title: r.title ?? "", snippet: r.snippet ?? "" }));
  },
};

const googleCse: WebSearchProvider = {
  id: "google_cse",
  label: "Google Programmable Search",
  async search(query) {
    const env = getEnv();
    if (!env.GOOGLE_CSE_API_KEY || !env.GOOGLE_CSE_CX) {
      throw new IntegrationNotConfiguredError("Google Programmable Search", "Defina GOOGLE_CSE_API_KEY e GOOGLE_CSE_CX.");
    }
    const params = new URLSearchParams({ key: env.GOOGLE_CSE_API_KEY, cx: env.GOOGLE_CSE_CX, q: query, gl: "br", hl: "pt-BR", num: "10" });
    const { status, data } = await requestJson<{ items?: Array<{ link: string; title: string; snippet?: string }>; error?: { message: string } }>(
      `https://www.googleapis.com/customsearch/v1?${params}`,
      { integration: "Google Programmable Search" },
    );
    if (status !== 200) fail("Google Programmable Search", status, data?.error?.message);
    return (data?.items ?? []).map((r) => ({ url: r.link, title: r.title ?? "", snippet: r.snippet ?? "" }));
  },
};

const PROVIDERS = { brave, serper, google_cse: googleCse };

function providerKeyConfigured(id: WebSearchProvider["id"]): boolean {
  const env = getEnv();
  if (id === "brave") return Boolean(env.BRAVE_SEARCH_API_KEY);
  if (id === "serper") return Boolean(env.SERPER_API_KEY);
  return Boolean(env.GOOGLE_CSE_API_KEY && env.GOOGLE_CSE_CX);
}

/** Provedor ativo: SEARCH_PROVIDER, ou o primeiro com chave configurada. */
export function getWebSearchProvider(): WebSearchProvider | null {
  const selected = getEnv().SEARCH_PROVIDER;
  if (selected) return providerKeyConfigured(selected) ? PROVIDERS[selected] : null;
  const firstConfigured = (Object.keys(PROVIDERS) as WebSearchProvider["id"][]).find(providerKeyConfigured);
  return firstConfigured ? PROVIDERS[firstConfigured] : null;
}

export async function webSearch(query: string): Promise<{ provider: WebSearchProvider; results: WebResult[] }> {
  const provider = getWebSearchProvider();
  if (!provider) throw new IntegrationNotConfiguredError("Busca web", "Nenhum provedor de busca web configurado.");
  await consumeQuota(`search_${provider.id}`, getEnv().SEARCH_DAILY_LIMIT);
  const results = await provider.search(query);
  return { provider, results };
}
