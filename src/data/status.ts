import type { ContatoStatus, SiteStatus } from "@/types";

export type Tom = "neutro" | "info" | "sucesso" | "aviso" | "perigo" | "destaque";

export const STATUS: Record<ContatoStatus, { rotulo: string; plural: string; tom: Tom }> = {
  novo: { rotulo: "Novo", plural: "Novos", tom: "neutro" },
  enviado: { rotulo: "Enviada", plural: "Enviadas", tom: "info" },
  respondeu: { rotulo: "Respondeu", plural: "Responderam", tom: "destaque" },
  fechado: { rotulo: "Cliente", plural: "Clientes", tom: "sucesso" },
};

export const ORDEM_STATUS: ContatoStatus[] = ["novo", "enviado", "respondeu", "fechado"];

/** As três etapas que você marca no cartão ("novo" é quando nenhuma está marcada). */
export const ETAPAS: Exclude<ContatoStatus, "novo">[] = ["enviado", "respondeu", "fechado"];

export const SITE: Record<SiteStatus, { rotulo: string; tom: Tom }> = {
  sem_site: { rotulo: "Sem site", tom: "sucesso" },
  so_perfil: { rotulo: "Só perfil", tom: "aviso" },
  com_site: { rotulo: "Tem site", tom: "neutro" },
};
