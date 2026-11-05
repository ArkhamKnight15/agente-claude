import { normalizarTexto } from "./texto";

/**
 * Lê uma lista colada no app: CSV com ";" ou ",", colunas separadas por tabulação (planilha)
 * ou tabela em Markdown ("| a | b |"). Com cabeçalho, as colunas podem vir em qualquer ordem;
 * sem cabeçalho, segue a ordem de COLUNAS.
 */

export const COLUNAS = ["nome", "telefone", "cidade", "uf", "site", "categoria", "endereco", "fonte", "consultado"] as const;
export type Coluna = (typeof COLUNAS)[number];

const APELIDOS: Record<string, Coluna> = {
  nome: "nome",
  empresa: "nome",
  "nome da empresa": "nome",
  telefone: "telefone",
  fone: "telefone",
  celular: "telefone",
  whatsapp: "telefone",
  "telefone whatsapp": "telefone",
  cidade: "cidade",
  municipio: "cidade",
  uf: "uf",
  estado: "uf",
  site: "site",
  "site instagram": "site",
  instagram: "site",
  url: "site",
  categoria: "categoria",
  nicho: "categoria",
  tipo: "categoria",
  segmento: "categoria",
  endereco: "endereco",
  fonte: "fonte",
  origem: "fonte",
  "link da fonte": "fonte",
  consultado: "consultado",
  "consultado em": "consultado",
  "data da consulta": "consultado",
  data: "consultado",
  pesquisado: "consultado",
  "pesquisado em": "consultado",
};

/** Data no formato dd/mm/aaaa ou aaaa-mm-dd → ISO (meio-dia, para não mudar de dia pelo fuso). */
export function lerData(valor: string | undefined): string | null {
  const texto = valor?.trim() ?? "";
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const [ano, mes, dia] = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : [];
  if (!ano) return null;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia), 15));
  return data.getUTCDate() === Number(dia) && data.getUTCMonth() === Number(mes) - 1 ? data.toISOString() : null;
}

export const MAX_LINHAS_IMPORTACAO = 300;

export type CamposLidos = Partial<Record<Coluna, string>>;

export interface LinhaLida {
  linha: number; // número da linha no texto colado (para apontar erros)
  campos: CamposLidos;
}

function separadorDe(linha: string): string {
  if (linha.trim().startsWith("|")) return "|";
  if (linha.includes("\t")) return "\t";
  if (linha.includes(";")) return ";";
  return ",";
}

/** Divide respeitando aspas: "Rua A, 10" continua um campo só; "" vira ". */
export function dividirLinha(linha: string, separador: string): string[] {
  const texto = separador === "|" ? linha.trim().replace(/^\|/, "").replace(/\|$/, "") : linha;
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      if (aspas && texto[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (c === separador && !aspas) {
      campos.push(atual.trim());
      atual = "";
    } else atual += c;
  }
  campos.push(atual.trim());
  return campos;
}

function colunaDoCabecalho(celula: string): Coluna | undefined {
  return APELIDOS[normalizarTexto(celula)];
}

export function lerLista(texto: string): { linhas: LinhaLida[]; excedeu: boolean } {
  const brutas = texto
    .split(/\r?\n/)
    .map((conteudo, i) => ({ conteudo, linha: i + 1 }))
    .filter(({ conteudo }) => {
      const t = conteudo.trim();
      return t && !t.startsWith("```") && !/^\|?[\s:|-]+\|?$/.test(t); // cercas de código e "|---|---|"
    });
  if (brutas.length === 0) return { linhas: [], excedeu: false };

  const separador = separadorDe(brutas[0].conteudo);
  const primeira = dividirLinha(brutas[0].conteudo, separador);
  const cabecalho = primeira.map(colunaDoCabecalho);
  const temCabecalho = cabecalho.includes("nome");
  const ordem: Array<Coluna | undefined> = temCabecalho ? cabecalho : [...COLUNAS];
  const dados = temCabecalho ? brutas.slice(1) : brutas;

  const linhas = dados.slice(0, MAX_LINHAS_IMPORTACAO).map(({ conteudo, linha }) => {
    const valores = dividirLinha(conteudo, separador);
    const campos: CamposLidos = {};
    ordem.forEach((coluna, i) => {
      const valor = valores[i]?.trim();
      if (coluna && valor && !/^[-–—]$/.test(valor) && !campos[coluna]) campos[coluna] = valor;
    });
    return { linha, campos };
  });
  return { linhas, excedeu: dados.length > MAX_LINHAS_IMPORTACAO };
}
