import { PLATFORM_DOMAINS, type PlatformKind } from "@/data/platforms";
import { tokenCoverage } from "@/lib/text";

// Segundo nível brasileiro tratado como sufixo público (registro.br).
const BR_SECOND_LEVEL = new Set([
  "com",
  "net",
  "org",
  "edu",
  "gov",
  "art",
  "adv",
  "arq",
  "eng",
  "med",
  "odo",
  "vet",
  "psi",
  "nom",
  "blog",
  "eco",
  "emp",
  "ind",
  "inf",
  "imb",
  "tur",
  "esp",
  "far",
  "fot",
  "rec",
  "srv",
  "tmp",
  "tv",
  "app",
  "dev",
  "log",
  "seg",
  "agr",
  "bio",
  "coop",
  "leg",
  "mus",
  "ong",
]);

export function parseUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

export function hostnameOf(raw: string): string | null {
  const url = parseUrl(raw);
  return url ? url.hostname.toLowerCase().replace(/^www\./, "") : null;
}

/** Domínio registrável (ex.: "loja.exemplo.com.br" → "exemplo.com.br"). */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  if (tld === "br" && BR_SECOND_LEVEL.has(sld)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

export type UrlKind = PlatformKind | "own_domain";

export interface UrlClassification {
  kind: UrlKind;
  label: string;
  host: string;
  domain: string;
}

/** Diferencia site próprio de perfis sociais, diretórios, marketplaces etc. */
export function classifyUrl(raw: string): UrlClassification | null {
  const url = parseUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const domain = registrableDomain(host);

  // Verifica do mais específico ao mais genérico (sites.google.com antes de google.com).
  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    const platform = PLATFORM_DOMAINS.get(candidate);
    if (platform) {
      if (candidate === "google.com" || candidate === "google.com.br") {
        // Só tratamos como "mapas" quando é de fato o Google Maps/perfil; outras páginas do
        // Google também não são site próprio.
        return { kind: "maps", label: "Google Maps", host, domain };
      }
      return { kind: platform.kind, label: platform.label, host, domain };
    }
  }
  return { kind: "own_domain", label: domain, host, domain };
}

/** Similaridade entre o nome da empresa e o rótulo do domínio (0 a 1). */
export function domainNameMatch(businessName: string, domain: string): number {
  const label = domain.split(".")[0] ?? "";
  return tokenCoverage(businessName, label.replace(/-/g, ""));
}

export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const url = parseUrl(raw);
  if (!url) return null;
  url.hash = "";
  // Remove parâmetros de rastreamento comuns.
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString().replace(/\/$/, "");
}

export function instagramHandle(raw: string): string | null {
  const url = parseUrl(raw);
  if (!url || !/instagram\.com$/i.test(url.hostname.replace(/^www\./, ""))) return null;
  const handle = url.pathname.split("/").filter(Boolean)[0];
  if (!handle || ["p", "reel", "explore", "stories", "accounts"].includes(handle)) return null;
  return handle;
}
