import dados from "./municipios.json";
import { normalizarTexto } from "@/lib/texto";

/** Municípios oficiais (IBGE — API de Localidades, dados públicos). Só no servidor: o arquivo é grande. */

interface Dados {
  fonte: string;
  municipios: Record<string, string[]>;
}

const base = dados as Dados;

export function municipiosDaUf(uf: string): string[] {
  return base.municipios[uf.toUpperCase()] ?? [];
}

/** Nome oficial do município (com acentos), aceitando digitação sem acento ou em minúsculas. */
export function municipioOficial(uf: string, cidade: string): string | null {
  const alvo = normalizarTexto(cidade);
  return municipiosDaUf(uf).find((nome) => normalizarTexto(nome) === alvo) ?? null;
}

export function ufValida(uf: string): boolean {
  return uf.toUpperCase() in base.municipios;
}
