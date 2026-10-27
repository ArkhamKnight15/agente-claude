import type { DataProvider } from "@/generated/prisma/enums";
import { googlePlacesSource } from "./google-places";
import { openStreetMapSource } from "./openstreetmap";
import type { BusinessSource } from "./types";

export const BUSINESS_SOURCES: Record<"GOOGLE_PLACES" | "OSM", BusinessSource> = {
  GOOGLE_PLACES: googlePlacesSource,
  OSM: openStreetMapSource,
};

export function getSource(provider: DataProvider): BusinessSource | null {
  return provider === "GOOGLE_PLACES" || provider === "OSM" ? BUSINESS_SOURCES[provider] : null;
}

export function configuredSources(): BusinessSource[] {
  return Object.values(BUSINESS_SOURCES).filter((s) => s.isConfigured());
}

export type { BusinessSource, RawBusiness, SearchPage, SearchRequest } from "./types";
