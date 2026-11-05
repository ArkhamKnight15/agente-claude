import "server-only";
import { municipioOficial, ufValida } from "@/data/municipios";
import { NICHO_OUTRO, nichoPorChave } from "@/data/nichos";
import { normalizarTexto } from "@/lib/texto";
import type { BuscaInput, BuscaResultado, Contato, Empresa, FonteBusca } from "@/types";
import { salvarEmpresas } from "./contatos";
import { getEnv } from "./env";
import { ErroDeUsuario } from "./erros";
import { buscarPaginaGoogle, converterLugar, type LugarGoogle } from "./fontes/google";
import { consultarOverpass, converterElemento, montarConsultaOsm } from "./fontes/osm";
import { consumirCota } from "./uso";

export const QUANTIDADES = [20, 40, 60] as const;
// Limite de cortesia com os servidores públicos do OpenStreetMap.
const LIMITE_OSM_DIA = 100;

type Candidata = Empresa & { cidadeDaFonte: string | null; fechada: boolean };

export function googleDisponivel(): boolean {
  return Boolean(getEnv().GOOGLE_PLACES_API_KEY);
}

async function buscarNoGoogle(termos: string[], cidade: string, uf: string, quantidade: number): Promise<{ candidatas: Candidata[]; consultas: number }> {
  const limite = getEnv().PLACES_DAILY_LIMIT;
  const maxConsultas = Math.ceil(quantidade / 20);
  const lugares: LugarGoogle[] = [];
  let consultas = 0;
  for (const termo of termos) {
    let token: string | undefined;
    do {
      if (consultas >= maxConsultas) break;
      if (!(await consumirCota("google", limite))) {
        if (consultas === 0) {
          throw new ErroDeUsuario(
            `O limite de ${limite} consultas ao Google por dia foi atingido. Amanhã libera de novo (ou aumente PLACES_DAILY_LIMIT). Até lá, use o OpenStreetMap.`,
          );
        }
        return { candidatas: lugares.map((l) => converterLugar(l, cidade, uf)), consultas };
      }
      const pagina = await buscarPaginaGoogle(termo, cidade, uf, token);
      consultas++;
      lugares.push(...(pagina.places ?? []));
      token = pagina.nextPageToken;
    } while (token);
    if (consultas >= maxConsultas) break;
  }
  return { candidatas: lugares.map((l) => converterLugar(l, cidade, uf)), consultas };
}

async function buscarNoOsm(termo: string, etiquetas: Array<[string, string]>, cidade: string, uf: string, quantidade: number): Promise<{ candidatas: Candidata[]; consultas: number }> {
  if (!(await consumirCota("osm", LIMITE_OSM_DIA))) {
    throw new ErroDeUsuario(`Limite de ${LIMITE_OSM_DIA} buscas por dia no OpenStreetMap atingido. Tente amanhã.`);
  }
  const elementos = await consultarOverpass(montarConsultaOsm({ cidade, uf, etiquetas, termo, limite: quantidade * 3 }));
  const candidatas = elementos.map((el) => converterElemento(el, cidade, uf)).filter((c): c is Candidata => c !== null);
  return { candidatas, consultas: 1 };
}

const ORDEM_SITE = { sem_site: 0, so_perfil: 1, com_site: 2 } as const;

const ORDEM_TELEFONE = { celular: 0, fixo: 1, desconhecido: 2 } as const;
const ordemTelefone = (c: Contato) => (c.telefone ? ORDEM_TELEFONE[c.telefoneTipo] : 3);

/** Sem site primeiro; depois celular (WhatsApp provável); depois as mais avaliadas (negócio ativo). */
function ordenar(a: Contato, b: Contato): number {
  return ORDEM_SITE[a.siteStatus] - ORDEM_SITE[b.siteStatus] || ordemTelefone(a) - ordemTelefone(b) || (b.avaliacoes ?? 0) - (a.avaliacoes ?? 0);
}

export async function executarBusca(input: BuscaInput): Promise<BuscaResultado> {
  const uf = input.uf.toUpperCase();
  if (!ufValida(uf)) throw new ErroDeUsuario("Escolha um estado.");
  const cidade = municipioOficial(uf, input.cidade);
  if (!cidade) throw new ErroDeUsuario(`Não encontramos “${input.cidade}” em ${uf}. Confira o nome da cidade.`);
  if (!QUANTIDADES.includes(input.quantidade as (typeof QUANTIDADES)[number])) throw new ErroDeUsuario("Quantidade inválida.");

  let termos: string[];
  let etiquetas: Array<[string, string]> = [];
  let nomeNicho: string;
  if (input.nicho === NICHO_OUTRO) {
    const termo = input.termo?.trim() ?? "";
    if (termo.length < 2) throw new ErroDeUsuario("Digite o tipo de empresa que você procura.");
    termos = [termo];
    nomeNicho = termo;
  } else {
    const nicho = nichoPorChave(input.nicho);
    if (!nicho) throw new ErroDeUsuario("Escolha um nicho.");
    termos = nicho.termos;
    etiquetas = nicho.osm;
    nomeNicho = nicho.nome;
  }

  let fonte: FonteBusca;
  if (input.fonte === "auto") fonte = googleDisponivel() ? "google" : "osm";
  else fonte = input.fonte;
  if (fonte === "google" && !googleDisponivel()) {
    throw new ErroDeUsuario("O Google Places não está configurado. Use o OpenStreetMap ou adicione GOOGLE_PLACES_API_KEY.");
  }

  const { candidatas, consultas } =
    fonte === "google" ? await buscarNoGoogle(termos, cidade, uf, input.quantidade) : await buscarNoOsm(termos[0], etiquetas, cidade, uf, input.quantidade);

  const chaveCidade = normalizarTexto(cidade);
  const vistas = new Set<string>();
  let foraDaCidade = 0;
  let fechadas = 0;
  const validas: Empresa[] = [];
  for (const { cidadeDaFonte, fechada, ...empresa } of candidatas) {
    if (vistas.has(empresa.id)) continue;
    vistas.add(empresa.id);
    if (fechada) fechadas++;
    else if (cidadeDaFonte && normalizarTexto(cidadeDaFonte) !== chaveCidade) foraDaCidade++;
    else if (validas.length < input.quantidade) validas.push(empresa);
  }

  const { contatos, novas, excluidas } = await salvarEmpresas(validas, nomeNicho);
  return { contatos: contatos.sort(ordenar), fonte, consultas, recebidas: vistas.size, foraDaCidade, fechadas, novas, excluidas };
}
