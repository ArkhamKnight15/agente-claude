/** Séries do gráfico diário (compartilhado entre servidor e cliente). */
export const DAILY_SERIES = [
  { key: "sent" as const, label: "Mensagens enviadas", color: "var(--series-1)" },
  { key: "replies" as const, label: "Respostas recebidas", color: "var(--series-2)" },
];
