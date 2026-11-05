export type Fonte = "google" | "osm";
export type FonteEscolhida = "auto" | Fonte;

/** O que a fonte informa sobre o site da empresa (não é uma verificação completa). */
export type SiteStatus = "sem_site" | "so_perfil" | "com_site";

export type TelefoneTipo = "celular" | "fixo" | "desconhecido";

export type ContatoStatus = "novo" | "enviado" | "respondeu" | "interessado" | "fechado" | "sem_interesse" | "nao_contatar";

/** Empresa como veio da fonte, já normalizada. */
export interface Empresa {
  id: string; // "google:<place_id>" ou "osm:node/123"
  nome: string;
  categoria: string | null;
  endereco: string | null;
  cidade: string;
  uf: string;
  telefone: string | null; // E.164 sem "+": 5511987654321
  telefoneTipo: TelefoneTipo;
  siteStatus: SiteStatus;
  siteUrl: string | null;
  siteRotulo: string | null; // ex.: "Instagram"
  mapsUrl: string | null;
  avaliacao: number | null;
  avaliacoes: number | null;
  fonte: Fonte;
}

/** Empresa salva, com o andamento do contato (compartilhado entre aparelhos). */
export interface Contato extends Empresa {
  nicho: string | null;
  status: ContatoStatus;
  observacao: string | null;
  contatadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ConfigMensagem {
  seuNome: string;
  suaEmpresa: string;
  preco: number;
  portfolio: string;
  modelo: string;
}

export interface BuscaInput {
  uf: string;
  cidade: string;
  nicho: string; // chave do catálogo ou "outro"
  termo?: string;
  quantidade: number;
  fonte: FonteEscolhida;
}

export interface BuscaResultado {
  contatos: Contato[];
  fonte: Fonte;
  consultas: number;
  recebidas: number;
  foraDaCidade: number;
  fechadas: number;
  novas: number;
}

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string };
