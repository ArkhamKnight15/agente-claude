import type { ContatoStatus, SiteStatus } from "@/types";

export type Tom = "neutro" | "info" | "sucesso" | "aviso" | "perigo" | "destaque";

export const STATUS: Record<ContatoStatus, { rotulo: string; tom: Tom; descricao: string }> = {
  novo: { rotulo: "Novo", tom: "neutro", descricao: "Ainda não contatado" },
  enviado: { rotulo: "Mensagem enviada", tom: "info", descricao: "Aguardando resposta" },
  respondeu: { rotulo: "Respondeu", tom: "destaque", descricao: "Conversa em andamento" },
  interessado: { rotulo: "Interessado", tom: "aviso", descricao: "Quer saber mais ou pediu proposta" },
  fechado: { rotulo: "Cliente", tom: "sucesso", descricao: "Venda fechada" },
  sem_interesse: { rotulo: "Sem interesse", tom: "neutro", descricao: "Não quis agora" },
  nao_contatar: { rotulo: "Não contatar", tom: "perigo", descricao: "Pediu para não receber mensagens" },
};

export const ORDEM_STATUS: ContatoStatus[] = ["novo", "enviado", "respondeu", "interessado", "fechado", "sem_interesse", "nao_contatar"];

export const SITE: Record<SiteStatus, { rotulo: string; tom: Tom }> = {
  sem_site: { rotulo: "Sem site", tom: "sucesso" },
  so_perfil: { rotulo: "Só perfil", tom: "aviso" },
  com_site: { rotulo: "Tem site", tom: "neutro" },
};
