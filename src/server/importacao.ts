import "server-only";
import { createHash } from "node:crypto";
import { municipioOficial, ufValida } from "@/data/municipios";
import { lerData, lerLista, type LinhaLida } from "@/lib/importacao";
import { classificarSite } from "@/lib/site";
import { normalizarTelefone } from "@/lib/telefone";
import { normalizarTexto } from "@/lib/texto";
import type { Contato, ContatoStatus, Empresa } from "@/types";
import { contatosPorIdsOuTelefones, salvarEmpresas } from "./contatos";
import { ErroDeUsuario } from "./erros";

/** Importação de listas coladas (ex.: pesquisa feita pelo Claude ou uma planilha). */

export type SituacaoImportacao = "nova" | "existente" | "ja_chamada" | "excluida" | "erro";

export interface ItemPrevia {
  linha: number;
  nome: string;
  cidade: string;
  uf: string;
  telefone: string | null;
  siteStatus: Empresa["siteStatus"] | null;
  siteRotulo: string | null;
  consultadoEm: string | null;
  situacao: SituacaoImportacao;
  statusAtual?: ContatoStatus;
  avisos: string[];
  erro?: string;
}

export interface PreviaImportacao {
  itens: ItemPrevia[];
  novas: number;
  existentes: number;
  jaChamadas: number;
  excluidas: number;
  erros: number;
  excedeu: boolean;
}

type Lida = { item: ItemPrevia; empresa: (Empresa & { categoria: string | null }) | null };

function idImportado(nome: string, cidade: string, uf: string, telefone: string | null): string {
  const chave = [normalizarTexto(nome), normalizarTexto(cidade), uf, telefone ?? ""].join("|");
  return `importado:${createHash("sha256").update(chave).digest("hex").slice(0, 20)}`;
}

function urlValida(valor: string | undefined): string | null {
  return valor && /^https?:\/\/\S+$/i.test(valor) ? valor : null;
}

function converter({ linha, campos }: LinhaLida): Lida {
  const nome = campos.nome?.trim() ?? "";
  const uf = (campos.uf ?? "").trim().toUpperCase();
  const base: ItemPrevia = { linha, nome: nome || "(sem nome)", cidade: campos.cidade ?? "", uf, telefone: null, siteStatus: null, siteRotulo: null, consultadoEm: null, situacao: "erro", avisos: [] };
  if (nome.length < 2) return { item: { ...base, erro: "Falta o nome da empresa." }, empresa: null };
  if (!ufValida(uf)) return { item: { ...base, erro: "UF inválida (use a sigla, ex.: SP)." }, empresa: null };
  const cidade = municipioOficial(uf, campos.cidade ?? "");
  if (!cidade) return { item: { ...base, erro: `Cidade “${campos.cidade ?? ""}” não encontrada em ${uf}.` }, empresa: null };

  const avisos: string[] = [];
  const telefone = normalizarTelefone(campos.telefone);
  if (campos.telefone && !telefone) avisos.push("telefone inválido, ignorado");
  if (!telefone) avisos.push("sem telefone");
  const site = classificarSite(campos.site);
  const consultadoEm = lerData(campos.consultado);
  if (campos.consultado && !consultadoEm) avisos.push("data inválida, usada a de hoje");

  const empresa: Empresa & { categoria: string | null } = {
    id: idImportado(nome, cidade, uf, telefone?.numero ?? null),
    nome,
    categoria: campos.categoria?.trim() || null,
    endereco: campos.endereco?.trim() || null,
    cidade,
    uf,
    telefone: telefone?.numero ?? null,
    telefoneTipo: telefone?.tipo ?? "desconhecido",
    siteStatus: site.status,
    siteUrl: site.url,
    siteRotulo: site.rotulo,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nome} ${campos.endereco ?? ""} ${cidade} ${uf}`.replace(/\s+/g, " ").trim())}`,
    avaliacao: null,
    avaliacoes: null,
    fonte: "importado",
    origemUrl: urlValida(campos.fonte),
    consultadoEm: consultadoEm ?? new Date().toISOString(),
  };
  return {
    item: { ...base, nome, cidade, telefone: empresa.telefone, siteStatus: site.status, siteRotulo: site.rotulo, consultadoEm: empresa.consultadoEm, situacao: "nova", avisos },
    empresa,
  };
}

async function analisar(texto: string): Promise<{ previa: PreviaImportacao; validas: Array<Empresa & { categoria: string | null }> }> {
  if (texto.length > 200_000) throw new ErroDeUsuario("A lista é grande demais. Importe em partes.");
  const { linhas, excedeu } = lerLista(texto);
  if (linhas.length === 0) throw new ErroDeUsuario("Cole a lista de empresas, uma por linha.");

  const lidas = linhas.map(converter);
  const candidatas = lidas.flatMap((l) => (l.empresa ? [l.empresa] : []));
  const existentes = await contatosPorIdsOuTelefones(
    candidatas.map((e) => e.id),
    candidatas.flatMap((e) => (e.telefone ? [e.telefone] : [])),
  );
  type Existente = (typeof existentes)[number];
  const porId = new Map<string, Existente>(existentes.map((c) => [c.id, c]));
  const porTelefone = new Map<string, Existente>(existentes.filter((c) => c.telefone).map((c) => [c.telefone as string, c]));

  const vistas = new Set<string>();
  const validas: Array<Empresa & { categoria: string | null }> = [];
  for (const { item, empresa } of lidas) {
    if (!empresa) continue;
    const chave = empresa.telefone ?? empresa.id;
    if (vistas.has(chave)) {
      item.situacao = "erro";
      item.erro = "Repetida nesta lista.";
      continue;
    }
    vistas.add(chave);
    const existente = porId.get(empresa.id) ?? (empresa.telefone ? porTelefone.get(empresa.telefone) : undefined);
    if (existente?.excluido) {
      item.situacao = "excluida"; // você excluiu: não volta
      continue;
    }
    if (existente) {
      item.situacao = existente.status === "novo" ? "existente" : "ja_chamada";
      item.statusAtual = existente.status;
    }
    validas.push(empresa);
  }

  const itens = lidas.map((l) => l.item);
  const contar = (s: SituacaoImportacao) => itens.filter((i) => i.situacao === s).length;
  return {
    previa: { itens, novas: contar("nova"), existentes: contar("existente"), jaChamadas: contar("ja_chamada"), excluidas: contar("excluida"), erros: contar("erro"), excedeu },
    validas,
  };
}

export async function preverImportacao(texto: string): Promise<PreviaImportacao> {
  return (await analisar(texto)).previa;
}

/** Salva as empresas válidas (quem já existe mantém o andamento) e devolve os contatos. */
export async function importarLista(texto: string): Promise<{ previa: PreviaImportacao; contatos: Contato[] }> {
  const { previa, validas } = await analisar(texto);
  if (validas.length === 0) throw new ErroDeUsuario("Nenhuma linha válida para importar. Confira os erros na prévia.");
  const porCategoria = new Map<string, Empresa[]>();
  for (const { categoria, ...empresa } of validas) {
    const nicho = categoria ?? "Importado";
    porCategoria.set(nicho, [...(porCategoria.get(nicho) ?? []), { ...empresa, categoria }]);
  }
  const contatos: Contato[] = [];
  for (const [nicho, empresas] of porCategoria) contatos.push(...(await salvarEmpresas(empresas, nicho)).contatos);
  return { previa, contatos };
}

