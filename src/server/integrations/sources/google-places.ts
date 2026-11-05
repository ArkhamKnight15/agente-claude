import { getEnv } from "@/server/env";
import { IntegrationError, IntegrationNotConfiguredError } from "@/server/errors";
import { isRetryableStatus, requestJson } from "@/server/integrations/http";
import { consumeQuota } from "@/server/services/usage";
import type { BusinessSource, RawBusiness, SearchPage, SearchRequest } from "./types";

/**
 * Google Places API (New) — Text Search.
 * Documentação: https://developers.google.com/maps/documentation/places/web-service/text-search
 * Atenção aos Termos do Google Maps Platform sobre armazenamento de conteúdo (ver README).
 */

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_ENDPOINT = "https://places.googleapis.com/v1/places";

const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "businessStatus",
  "primaryTypeDisplayName",
  "rating",
  "userRatingCount",
  "location",
];

interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

export interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text: string };
  rating?: number;
  userRatingCount?: number;
  location?: { latitude: number; longitude: number };
}

interface SearchTextResponse {
  places?: GooglePlace[];
  nextPageToken?: string;
  error?: {
    code: number;
    message: string;
    status: string;
    details?: Array<{ "@type"?: string; reason?: string; metadata?: Record<string, string> }>;
  };
}

/** Motivos do Google (ErrorInfo.reason) traduzidos em uma ação concreta. */
const REASON_HINTS: Record<string, string> = {
  SERVICE_DISABLED: "A Places API (New) não está ativada no projeto da chave.",
  ACCESS_NOT_CONFIGURED: "A Places API (New) não está ativada no projeto da chave.",
  BILLING_DISABLED: "O projeto da chave está sem faturamento ativo.",
  API_KEY_SERVICE_BLOCKED: "As restrições de API da chave não incluem a Places API (New).",
  API_KEY_HTTP_REFERRER_BLOCKED: "A chave tem restrição de sites — use “Nenhuma” em Restrições de aplicativo.",
  API_KEY_IP_ADDRESS_BLOCKED: "A chave tem restrição de IP — a Vercel não tem IP fixo; use “Nenhuma”.",
  API_KEY_ANDROID_APP_BLOCKED: "A chave está restrita a apps Android — use “Nenhuma” em Restrições de aplicativo.",
  API_KEY_IOS_APP_BLOCKED: "A chave está restrita a apps iOS — use “Nenhuma” em Restrições de aplicativo.",
  API_KEY_INVALID: "A chave não é válida — copie novamente, sem aspas nem espaços.",
};

/** Mensagem de erro com o motivo informado pelo Google e o número do projeto dono da chave. */
export function describePlacesError(status: number, data: SearchTextResponse | null): string {
  const info = data?.error?.details?.find((d) => d.reason);
  const reason = info?.reason;
  const project = info?.metadata?.consumer?.replace(/^projects\//, "") ?? info?.metadata?.containerInfo;
  const parts = [`Google Places respondeu com erro: ${data?.error?.message ?? `HTTP ${status}`}`];
  if (reason) parts.push(`Motivo: ${reason}. ${REASON_HINTS[reason] ?? ""}`.trim());
  else if (status === 403) {
    parts.push("Verifique se a chave é válida, se a Places API (New) está ativada e se o faturamento está habilitado.");
  }
  if (project) parts.push(`Projeto da chave: nº ${project} — confira se é o mesmo número no painel do Google Cloud.`);
  return parts.join(" ");
}

function component(place: GooglePlace, type: string, short = false): string | null {
  const c = place.addressComponents?.find((ac) => ac.types.includes(type));
  return c ? (short ? c.shortText : c.longText) : null;
}

export function mapGooglePlace(place: GooglePlace): RawBusiness {
  return {
    provider: "GOOGLE_PLACES",
    externalId: place.id,
    sourceUrl: place.googleMapsUri ?? null,
    name: place.displayName?.text?.trim() ?? "Sem nome",
    category: place.primaryTypeDisplayName?.text ?? null,
    address: place.formattedAddress ?? null,
    neighborhood: component(place, "sublocality_level_1") ?? component(place, "sublocality"),
    city: component(place, "administrative_area_level_2") ?? component(place, "locality"),
    state: component(place, "administrative_area_level_1", true),
    postalCode: component(place, "postal_code"),
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null,
    whatsapp: null,
    email: null,
    website: place.websiteUri ?? null,
    instagram: null,
    facebook: null,
    googleMapsUrl: place.googleMapsUri ?? null,
    businessStatus: place.businessStatus ?? null,
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    hasWebsiteField: true,
  };
}

function raiseForError(status: number, data: SearchTextResponse | null): never {
  throw new IntegrationError("Google Places", describePlacesError(status, data), isRetryableStatus(status), data?.error?.status);
}

export const googlePlacesSource: BusinessSource = {
  provider: "GOOGLE_PLACES",
  label: "Google Places",
  isConfigured: () => Boolean(getEnv().GOOGLE_PLACES_API_KEY),

  async search(request: SearchRequest): Promise<SearchPage> {
    const env = getEnv();
    if (!env.GOOGLE_PLACES_API_KEY) {
      throw new IntegrationNotConfiguredError("Google Places", "Defina GOOGLE_PLACES_API_KEY para pesquisar no Google Places.");
    }
    await consumeQuota("google_places", env.PLACES_DAILY_LIMIT);
    const { status, data } = await requestJson<SearchTextResponse>(ENDPOINT, {
      integration: "Google Places",
      method: "POST",
      headers: {
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": [...PLACE_FIELDS.map((f) => `places.${f}`), "nextPageToken"].join(","),
      },
      body: {
        textQuery: `${request.term} em ${request.city} - ${request.state}`,
        languageCode: "pt-BR",
        regionCode: "BR",
        pageSize: Math.min(20, Math.max(1, request.limit)),
        ...(request.cursor ? { pageToken: request.cursor } : {}),
      },
    });
    if (status !== 200 || !data) raiseForError(status, data);
    return {
      items: (data.places ?? []).map(mapGooglePlace),
      nextCursor: data.nextPageToken ?? null,
      requests: 1,
    };
  },
};

/** Atualiza os dados de um local pelo place_id (usado em "Atualizar dados da fonte"). */
export async function fetchPlaceDetails(placeId: string): Promise<RawBusiness> {
  const env = getEnv();
  if (!env.GOOGLE_PLACES_API_KEY) throw new IntegrationNotConfiguredError("Google Places");
  await consumeQuota("google_places", env.PLACES_DAILY_LIMIT);
  const { status, data } = await requestJson<GooglePlace & SearchTextResponse>(
    `${DETAILS_ENDPOINT}/${encodeURIComponent(placeId)}?languageCode=pt-BR&regionCode=BR`,
    {
      integration: "Google Places",
      headers: { "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": PLACE_FIELDS.join(",") },
    },
  );
  if (status !== 200 || !data) raiseForError(status, data);
  return mapGooglePlace(data);
}
