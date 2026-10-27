import { diceSimilarity, normalizeBusinessName, normalizeText } from "@/lib/text";
import { hostnameOf, registrableDomain } from "@/lib/url";

/** Regras de deduplicação de empresas vindas de fontes diferentes. */

export interface DedupeCandidate {
  id: string;
  normalizedName: string;
  cityNormalized: string;
  state: string;
  phoneE164: string | null;
  websiteUrl: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface IncomingBusiness {
  name: string;
  city: string;
  state: string;
  phoneE164: string | null;
  websiteUrl: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type DuplicateReason = "phone" | "website" | "name_location";

export interface DuplicateMatch {
  id: string;
  reason: DuplicateReason;
  similarity: number;
}

const toRad = (d: number) => (d * Math.PI) / 180;

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function websiteDomain(url: string | null): string | null {
  if (!url) return null;
  const host = hostnameOf(url);
  return host ? registrableDomain(host) : null;
}

export function findDuplicate(incoming: IncomingBusiness, candidates: DedupeCandidate[]): DuplicateMatch | null {
  const name = normalizeBusinessName(incoming.name);
  const city = normalizeText(incoming.city);
  const domain = websiteDomain(incoming.websiteUrl);

  for (const c of candidates) {
    if (incoming.phoneE164 && c.phoneE164 === incoming.phoneE164) {
      return { id: c.id, reason: "phone", similarity: 1 };
    }
  }
  if (domain) {
    for (const c of candidates) {
      if (websiteDomain(c.websiteUrl) === domain) return { id: c.id, reason: "website", similarity: 1 };
    }
  }

  const numbers = (value: string) => (value.match(/\d+/g) ?? []).join(" ");
  let best: DuplicateMatch | null = null;
  for (const c of candidates) {
    if (c.state !== incoming.state || c.cityNormalized !== city) continue;
    // Números diferentes no nome indicam filiais/unidades distintas ("Unidade 1" x "Unidade 2").
    if (numbers(name) !== numbers(c.normalizedName)) continue;
    const similarity = diceSimilarity(name, c.normalizedName);
    const near =
      incoming.latitude !== null &&
      incoming.longitude !== null &&
      c.latitude !== null &&
      c.longitude !== null &&
      distanceMeters(incoming.latitude, incoming.longitude, c.latitude, c.longitude) < 250;
    // Telefones diferentes: só é a mesma empresa se estiver no mesmo endereço.
    const conflictingPhones = Boolean(incoming.phoneE164 && c.phoneE164 && incoming.phoneE164 !== c.phoneE164);
    if (conflictingPhones && !near) continue;
    const threshold = near ? 0.75 : 0.92;
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { id: c.id, reason: "name_location", similarity };
    }
  }
  return best;
}
