import "server-only";
import { normalizarTelefone } from "@/lib/telefone";
import { classificarSite } from "@/lib/site";
import type { Empresa } from "@/types";
import { getEnv } from "../env";
import { ErroDeFonte } from "../erros";

/**
 * Google Places API (New) — Text Search.
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 */

const CAMPOS = [
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
];

interface ComponenteEndereco {
  longText: string;
  shortText: string;
  types: string[];
}

export interface LugarGoogle {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: ComponenteEndereco[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text: string };
  rating?: number;
  userRatingCount?: number;
}

export interface RespostaGoogle {
  places?: LugarGoogle[];
  nextPageToken?: string;
  error?: {
    code: number;
    message: string;
    status: string;
    details?: Array<{
      "@type"?: string;
      reason?: string;
      metadata?: Record<string, string>;
      message?: string; // google.rpc.LocalizedMessage
      links?: Array<{ description?: string; url?: string }>; // google.rpc.Help
    }>;
  };
}

/** Motivos informados pelo Google (ErrorInfo.reason), traduzidos em ação concreta. */
const MOTIVOS: Record<string, string> = {
  SERVICE_DISABLED: "A Places API (New) não está ativada no projeto da chave.",
  ACCESS_NOT_CONFIGURED: "A Places API (New) não está ativada no projeto da chave.",
  BILLING_DISABLED: "O projeto da chave está sem faturamento ativo.",
  API_KEY_SERVICE_BLOCKED: "As restrições de API da chave não incluem a Places API (New).",
  API_KEY_HTTP_REFERRER_BLOCKED: "A chave tem restrição de sites. Em Restrições de aplicativo, escolha “Nenhuma”.",
  API_KEY_IP_ADDRESS_BLOCKED: "A chave tem restrição de IP. A Vercel não tem IP fixo: escolha “Nenhuma”.",
  API_KEY_ANDROID_APP_BLOCKED: "A chave está restrita a apps Android. Escolha “Nenhuma”.",
  API_KEY_IOS_APP_BLOCKED: "A chave está restrita a apps iOS. Escolha “Nenhuma”.",
  API_KEY_INVALID: "A chave não é válida. Copie de novo, sem aspas nem espaços.",
};

export function descreverErroGoogle(status: number, resposta: RespostaGoogle | null): string {
  const info = resposta?.error?.details?.find((d) => d.reason);
  const projeto = info?.metadata?.consumer?.replace(/^projects\//, "");
  const partes = [`O Google recusou a busca: ${resposta?.error?.message ?? `HTTP ${status}`}.`];
  if (info?.reason) partes.push(`Motivo: ${info.reason}. ${MOTIVOS[info.reason] ?? ""}`.trim());
  else if (status === 403) partes.push("Confira se a Places API (New) está ativada, se o faturamento está ligado e se a chave não tem restrições.");
  if (projeto) partes.push(`A chave pertence ao projeto nº ${projeto} — confira se é o mesmo do painel do Google Cloud.`);
  // Outros detalhes que o Google mande (mensagem traduzida, links de ajuda), para o diagnóstico.
  const extras = (resposta?.error?.details ?? []).flatMap((d) => [d.message, ...(d.links ?? []).map((l) => [l.description, l.url].filter(Boolean).join(": "))]).filter(Boolean);
  const codigo = resposta?.error?.status;
  if (extras.length || (codigo && !info?.reason)) partes.push(`Detalhes do Google: ${[codigo, ...extras].filter(Boolean).join(" · ")}`.slice(0, 400));
  return partes.join(" ");
}

function componente(lugar: LugarGoogle, tipo: string): string | null {
  return lugar.addressComponents?.find((c) => c.types.includes(tipo))?.longText ?? null;
}

export function converterLugar(lugar: LugarGoogle, cidadePadrao: string, uf: string): Empresa & { cidadeDaFonte: string | null; fechada: boolean } {
  const telefone = normalizarTelefone(lugar.internationalPhoneNumber ?? lugar.nationalPhoneNumber);
  const site = classificarSite(lugar.websiteUri);
  const cidadeDaFonte = componente(lugar, "administrative_area_level_2") ?? componente(lugar, "locality");
  return {
    id: `google:${lugar.id}`,
    nome: lugar.displayName?.text?.trim() || "Sem nome",
    categoria: lugar.primaryTypeDisplayName?.text ?? null,
    endereco: lugar.formattedAddress ?? null,
    cidade: cidadePadrao,
    uf,
    telefone: telefone?.numero ?? null,
    telefoneTipo: telefone?.tipo ?? "desconhecido",
    siteStatus: site.status,
    siteUrl: site.url,
    siteRotulo: site.rotulo,
    mapsUrl: lugar.googleMapsUri ?? null,
    avaliacao: lugar.rating ?? null,
    avaliacoes: lugar.userRatingCount ?? null,
    fonte: "google",
    origemUrl: null,
    consultadoEm: new Date().toISOString(),
    cidadeDaFonte,
    fechada: lugar.businessStatus === "CLOSED_PERMANENTLY" || lugar.businessStatus === "CLOSED_TEMPORARILY",
  };
}

export async function buscarPaginaGoogle(termo: string, cidade: string, uf: string, token?: string): Promise<RespostaGoogle> {
  const env = getEnv();
  if (!env.GOOGLE_PLACES_API_KEY) throw new ErroDeFonte("Google Places não configurado (falta GOOGLE_PLACES_API_KEY).", false);
  let resposta: Response;
  try {
    resposta = await fetch(env.GOOGLE_PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": [...CAMPOS.map((c) => `places.${c}`), "nextPageToken"].join(","),
      },
      body: JSON.stringify({
        textQuery: `${termo} em ${cidade} - ${uf}`,
        languageCode: "pt-BR",
        regionCode: "BR",
        pageSize: 20,
        ...(token ? { pageToken: token } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ErroDeFonte("Não foi possível falar com o Google agora. Tente de novo em instantes.", true);
  }
  const dados = (await resposta.json().catch(() => null)) as RespostaGoogle | null;
  if (!resposta.ok || !dados) {
    console.error("[google-places] erro", resposta.status, JSON.stringify(dados?.error ?? null).slice(0, 2000));
    throw new ErroDeFonte(descreverErroGoogle(resposta.status, dados), resposta.status === 429 || resposta.status >= 500);
  }
  return dados;
}
