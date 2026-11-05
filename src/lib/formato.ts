const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const data = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

export function formatarReais(valor: number): string {
  return brl.format(valor);
}

export function formatarData(iso: string | null): string {
  return iso ? data.format(new Date(iso)) : "";
}

export function plural(n: number, singular: string, pluralForm: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? singular : pluralForm}`;
}
