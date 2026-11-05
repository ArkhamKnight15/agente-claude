import "server-only";
import { normalizarTelefone } from "@/lib/telefone";
import { classificarSite } from "@/lib/site";
import type { Empresa } from "@/types";
import { getEnv } from "../env";
import { ErroDeFonte } from "../erros";

/**
 * OpenStreetMap via Overpass API — gratuito, sem chave. Dados abertos (ODbL):
 * "© colaboradores do OpenStreetMap". A cobertura varia por cidade.
 */

export interface ElementoOsm {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const escapar = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const escaparRegex = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function montarConsultaOsm(opcoes: { cidade: string; uf: string; etiquetas: Array<[string, string]>; termo: string; limite: number }): string {
  const clausulas = opcoes.etiquetas.length
    ? opcoes.etiquetas.map(([k, v]) => `  nwr["${escapar(k)}"="${escapar(v)}"]["name"](area.cidade);`)
    : [`  nwr["name"~"${escapar(escaparRegex(opcoes.termo))}",i](area.cidade);`];
  return [
    "[out:json][timeout:50];",
    `area["ISO3166-2"="BR-${escapar(opcoes.uf)}"]["admin_level"="4"]->.uf;`,
    `area["boundary"="administrative"]["admin_level"="8"]["name"="${escapar(opcoes.cidade)}"](area.uf)->.cidade;`,
    "(",
    ...clausulas,
    ");",
    `out center tags ${opcoes.limite};`,
  ].join("\n");
}

function primeiro(tags: Record<string, string>, chaves: string[]): string | null {
  for (const chave of chaves) {
    const valor = tags[chave]?.split(";")[0]?.trim();
    if (valor) return valor;
  }
  return null;
}

export function converterElemento(el: ElementoOsm, cidade: string, uf: string): (Empresa & { cidadeDaFonte: string | null; fechada: boolean }) | null {
  const tags = el.tags ?? {};
  if (!tags.name) return null;
  const telefone = normalizarTelefone(primeiro(tags, ["contact:whatsapp", "whatsapp", "phone", "contact:phone", "contact:mobile", "mobile"]));
  const site = classificarSite(primeiro(tags, ["website", "contact:website", "url", "contact:instagram", "instagram", "contact:facebook", "facebook"]));
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const rua = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
  const bairro = tags["addr:suburb"] ?? tags["addr:neighbourhood"];
  return {
    id: `osm:${el.type}/${el.id}`,
    nome: tags.name.trim(),
    categoria: tags.shop ?? tags.amenity ?? tags.craft ?? tags.office ?? tags.leisure ?? tags.healthcare ?? null,
    endereco: [rua, bairro].filter(Boolean).join(" — ") || null,
    cidade,
    uf,
    telefone: telefone?.numero ?? null,
    telefoneTipo: telefone?.tipo ?? "desconhecido",
    siteStatus: site.status,
    siteUrl: site.url,
    siteRotulo: site.rotulo,
    mapsUrl: lat !== undefined && lon !== undefined ? `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` : null,
    avaliacao: null,
    avaliacoes: null,
    fonte: "osm",
    origemUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    cidadeDaFonte: tags["addr:city"] ?? null,
    fechada: Boolean(tags["disused:shop"] || tags["disused:amenity"]),
  };
}

// Tempo total entre todos os servidores (a função da Vercel vai até 60 s nesta rota).
const TEMPO_TOTAL_MS = 50_000;

/** Tenta os servidores em ordem: se um estiver sobrecarregado ou fora do ar, usa o próximo. */
export async function consultarOverpass(consulta: string): Promise<ElementoOsm[]> {
  const env = getEnv();
  const prazo = Date.now() + TEMPO_TOTAL_MS;
  const falhas: string[] = [];
  for (const url of env.OVERPASS_URL) {
    const restante = prazo - Date.now();
    if (restante < 5_000) break;
    const host = new URL(url).host;
    try {
      const resposta = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": `Prospecta/1.0${env.OSM_CONTACT_EMAIL ? ` (${env.OSM_CONTACT_EMAIL})` : ""}`,
        },
        body: new URLSearchParams({ data: consulta }).toString(),
        signal: AbortSignal.timeout(Math.min(35_000, restante)),
      });
      if (resposta.status === 400) throw new ErroDeFonte("O OpenStreetMap não entendeu a busca. Tente outro termo.", false);
      if (!resposta.ok) {
        falhas.push(`${host}: HTTP ${resposta.status}`);
        continue;
      }
      const dados = (await resposta.json()) as { elements?: ElementoOsm[]; remark?: string };
      if (dados.remark && /runtime error|timed out/i.test(dados.remark)) {
        falhas.push(`${host}: tempo esgotado`);
        continue;
      }
      return dados.elements ?? [];
    } catch (error) {
      if (error instanceof ErroDeFonte) throw error;
      falhas.push(`${host}: sem resposta`);
    }
  }
  throw new ErroDeFonte(`Os servidores do OpenStreetMap estão sobrecarregados agora (${falhas.join(", ")}). Tente de novo em alguns minutos.`, true);
}
