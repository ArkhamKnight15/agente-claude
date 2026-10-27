import { getEnv } from "@/server/env";
import { IntegrationError, IntegrationNotConfiguredError } from "@/server/errors";
import { isRetryableStatus, USER_AGENT } from "@/server/integrations/http";
import { consumeQuota } from "@/server/services/usage";
import { normalizeText } from "@/lib/text";
import type { BusinessSource, RawBusiness, SearchPage, SearchRequest } from "./types";

/**
 * OpenStreetMap via Overpass API. Dados abertos (ODbL) — exigem atribuição
 * "© colaboradores do OpenStreetMap". Respeita a política de uso: consultas espaçadas,
 * User-Agent identificado e limite diário.
 */

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
  remark?: string;
}

function escapeQl(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildOverpassQuery(request: SearchRequest, maxResults: number): string {
  const tagClauses = (request.osmTags ?? []).map(
    ([k, v]) => `  nwr["${escapeQl(k)}"="${escapeQl(v)}"]["name"](area.city);`,
  );
  // Sem tags no catálogo (nicho personalizado): busca pelo termo no nome.
  const nameClause = `  nwr["name"~"${escapeQl(escapeRegex(request.term))}",i](area.city);`;
  const clauses = tagClauses.length ? tagClauses : [nameClause];
  return [
    "[out:json][timeout:90];",
    `area["ISO3166-2"="BR-${escapeQl(request.state)}"]["admin_level"="4"]->.uf;`,
    `area["boundary"="administrative"]["admin_level"="8"]["name"="${escapeQl(request.city)}"](area.uf)->.city;`,
    "(",
    ...clauses,
    ");",
    `out center tags ${maxResults};`,
  ].join("\n");
}

function first(tags: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = tags[key]?.split(";")[0]?.trim();
    if (value) return value;
  }
  return null;
}

function socialUrl(value: string | null, base: string): string | null {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}${value.replace(/^@/, "")}`;
}

export function mapOverpassElement(el: OverpassElement, fallbackCity: string, fallbackState: string): RawBusiness | null {
  const tags = el.tags ?? {};
  if (!tags.name) return null;
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
  const neighborhood = tags["addr:suburb"] ?? tags["addr:neighbourhood"] ?? null;
  const city = tags["addr:city"] ?? fallbackCity;
  const address = [street, neighborhood, city].filter(Boolean).join(" — ") || null;
  const lat = el.lat ?? el.center?.lat ?? null;
  const lon = el.lon ?? el.center?.lon ?? null;
  const category = tags.shop ?? tags.amenity ?? tags.craft ?? tags.office ?? tags.leisure ?? tags.healthcare ?? null;

  return {
    provider: "OSM",
    externalId: `${el.type}/${el.id}`,
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    name: tags.name.trim(),
    category,
    address,
    neighborhood,
    city,
    state: fallbackState,
    postalCode: tags["addr:postcode"] ?? null,
    latitude: lat,
    longitude: lon,
    phone: first(tags, ["phone", "contact:phone", "contact:mobile", "mobile"]),
    whatsapp: first(tags, ["contact:whatsapp", "whatsapp"]),
    email: first(tags, ["email", "contact:email"]),
    website: first(tags, ["website", "contact:website", "url"]),
    instagram: socialUrl(first(tags, ["contact:instagram", "instagram"]), "https://www.instagram.com/"),
    facebook: socialUrl(first(tags, ["contact:facebook", "facebook"]), "https://www.facebook.com/"),
    googleMapsUrl: lat !== null && lon !== null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : null,
    businessStatus: tags["disused:shop"] || tags["disused:amenity"] ? "CLOSED_PERMANENTLY" : null,
    rating: null,
    reviewCount: null,
    hasWebsiteField: false,
  };
}

export const openStreetMapSource: BusinessSource = {
  provider: "OSM",
  label: "OpenStreetMap",
  isConfigured: () => getEnv().OSM_ENABLED,

  async search(request: SearchRequest): Promise<SearchPage> {
    const env = getEnv();
    if (!env.OSM_ENABLED) throw new IntegrationNotConfiguredError("OpenStreetMap", "Fonte OpenStreetMap desativada (OSM_ENABLED=false).");
    // A Overpass retorna tudo de uma vez: não há próxima página.
    if (request.cursor === "done") return { items: [], nextCursor: null, requests: 0 };
    await consumeQuota("overpass", 500);

    const query = buildOverpassQuery(request, Math.min(500, Math.max(50, request.limit * 3)));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100_000);
    let response: Response;
    try {
      response = await fetch(env.OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": env.OSM_CONTACT_EMAIL ? `${USER_AGENT} contato:${env.OSM_CONTACT_EMAIL}` : USER_AGENT,
          Accept: "application/json",
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      });
    } catch (error) {
      throw new IntegrationError("OpenStreetMap", `Falha ao consultar a Overpass API: ${(error as Error).message}`, true);
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new IntegrationError(
        "OpenStreetMap",
        `Overpass API respondeu HTTP ${response.status}${response.status === 429 ? " (limite de uso — tente mais tarde)" : ""}.`,
        isRetryableStatus(response.status),
      );
    }
    const data = (await response.json()) as OverpassResponse;
    if (data.remark && /runtime error|timed out/i.test(data.remark)) {
      throw new IntegrationError("OpenStreetMap", `Overpass: ${data.remark}`, true);
    }
    const cityKey = normalizeText(request.city);
    const items = (data.elements ?? [])
      .map((el) => mapOverpassElement(el, request.city, request.state))
      .filter((item): item is RawBusiness => item !== null)
      .filter((item) => !item.city || normalizeText(item.city) === cityKey);
    return { items, nextCursor: "done", requests: 1 };
  },
};
