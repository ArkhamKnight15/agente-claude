import type { DataProvider } from "@/generated/prisma/enums";

/** Empresa como recebida de uma fonte externa, antes da normalização e deduplicação. */
export interface RawBusiness {
  provider: Extract<DataProvider, "GOOGLE_PLACES" | "OSM">;
  externalId: string;
  sourceUrl: string | null;
  name: string;
  category: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  googleMapsUrl: string | null;
  businessStatus: string | null;
  rating: number | null;
  reviewCount: number | null;
  /** Se a fonte possui um campo estruturado de site (ausência é um sinal mais forte). */
  hasWebsiteField: boolean;
}

export interface SearchRequest {
  term: string;
  city: string;
  state: string;
  cursor?: string | null;
  limit: number;
  osmTags?: Array<[string, string]>;
}

export interface SearchPage {
  items: RawBusiness[];
  nextCursor: string | null;
  requests: number;
}

export interface BusinessSource {
  provider: RawBusiness["provider"];
  label: string;
  isConfigured(): boolean;
  search(request: SearchRequest): Promise<SearchPage>;
}
