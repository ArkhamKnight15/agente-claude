import type { ConfigMensagem, Empresa } from "@/types";
import { formatarReais } from "./formato";

/**
 * Modelo de mensagem com variáveis entre chaves. Uma linha cuja variável ficaria vazia
 * (ex.: {portfolio} sem link cadastrado) é removida inteira, para o texto não ficar quebrado.
 */

export const VARIAVEIS = [
  { nome: "empresa", descricao: "Nome da empresa" },
  { nome: "cidade", descricao: "Cidade da empresa" },
  { nome: "situacao", descricao: "O que a fonte mostra sobre o site (ex.: “ainda não têm um site próprio”)" },
  { nome: "seu_nome", descricao: "Seu nome" },
  { nome: "sua_empresa", descricao: "Nome da sua empresa" },
  { nome: "preco", descricao: "Preço inicial (ex.: R$ 500,00)" },
  { nome: "portfolio", descricao: "Link dos seus trabalhos" },
] as const;

export const MODELO_PADRAO = [
  "Olá! Tudo bem?",
  "Aqui é {seu_nome}, da {sua_empresa}.",
  "Encontrei a {empresa} pesquisando empresas de {cidade} e vi que vocês {situacao}.",
  "Eu crio sites profissionais para negócios locais — com botão de WhatsApp, mapa, serviços e fotos — a partir de {preco}.",
  "Alguns trabalhos: {portfolio}",
  "Posso te mostrar como ficaria o de vocês, sem compromisso?",
  "Se preferir não receber mensagens, é só me avisar.",
].join("\n");

export const CONFIG_PADRAO: ConfigMensagem = {
  seuNome: "",
  suaEmpresa: "",
  preco: 500,
  portfolio: "",
  modelo: MODELO_PADRAO,
};

export function situacaoDoSite(empresa: Pick<Empresa, "siteStatus" | "siteRotulo">): string {
  if (empresa.siteStatus === "so_perfil") {
    return `aparecem pelo ${empresa.siteRotulo ?? "perfil nas redes sociais"}, mas ainda não têm um site próprio`;
  }
  if (empresa.siteStatus === "com_site") return "já têm um site — e eu posso deixá-lo mais moderno e fácil de usar no celular";
  return "ainda não têm um site próprio";
}

export function montarMensagem(modelo: string, empresa: Pick<Empresa, "nome" | "cidade" | "siteStatus" | "siteRotulo">, config: ConfigMensagem): string {
  const valores: Record<string, string> = {
    empresa: empresa.nome,
    cidade: empresa.cidade,
    situacao: situacaoDoSite(empresa),
    seu_nome: config.seuNome.trim(),
    sua_empresa: config.suaEmpresa.trim(),
    preco: config.preco > 0 ? formatarReais(config.preco) : "",
    portfolio: config.portfolio.trim(),
  };
  return modelo
    .split("\n")
    .flatMap((linha) => {
      let vazia = false;
      const pronta = linha.replace(/\{(\w+)\}/g, (original, nome: string) => {
        if (!(nome in valores)) return original; // variável desconhecida fica como está
        if (!valores[nome]) vazia = true;
        return valores[nome];
      });
      return vazia ? [] : [pronta];
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Campos do remetente que faltam para a mensagem ficar completa. */
export function camposFaltando(config: ConfigMensagem): string[] {
  const faltando: string[] = [];
  if (!config.seuNome.trim()) faltando.push("seu nome");
  if (!config.suaEmpresa.trim()) faltando.push("sua empresa");
  return faltando;
}
