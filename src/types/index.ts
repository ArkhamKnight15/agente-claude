/** De onde a empresa veio: busca automática ou lista importada (colada no app). */
export type Fonte = "google" | "osm" | "importado";
export type FonteBusca = Exclude<Fonte, "importado">;
export type FonteEscolhida = "auto" | FonteBusca;

/** O que a fonte informa sobre o site da empresa (não é uma verificação completa). */
export type SiteStatus = "sem_site" | "so_perfil" | "com_site";

export type TelefoneTipo = "celular" | "fixo" | "desconhecido";

/** Andamento do contato. Quem você não quer mais (ou pediu para não receber) é excluído, e não volta nas buscas. */
export type ContatoStatus = "novo" | "enviado" | "respondeu" | "fechado";

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
  origemUrl: string | null; // página onde o dado foi encontrado (listas importadas, OpenStreetMap)
  consultadoEm: string | null; // quando os dados foram consultados na fonte (ISO)
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
  fonte: FonteBusca;
  consultas: number;
  recebidas: number;
  foraDaCidade: number;
  fechadas: number;
  novas: number;
  excluidas: number;
}

export type Resultado<T> = { ok: true; data: T } | { ok: false; error: string };
