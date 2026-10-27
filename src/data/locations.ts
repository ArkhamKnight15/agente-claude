import data from "./br-municipios.json";
import { normalizeText } from "@/lib/text";

/** Estados e municípios brasileiros (fonte: IBGE — API de Localidades). */

export interface BrazilState {
  uf: string;
  name: string;
  region: string;
}

interface Dataset {
  source: string;
  states: Array<BrazilState & { capitalCode: string }>;
  municipalities: Record<string, Array<[code: string, name: string, capital: 0 | 1]>>;
}

const dataset = data as unknown as Dataset;

export const LOCATIONS_SOURCE = dataset.source;

export const BRAZIL_STATES: BrazilState[] = dataset.states.map(({ uf, name, region }) => ({
  uf,
  name,
  region,
}));

export const UF_CODES = BRAZIL_STATES.map((s) => s.uf);

export function stateName(uf: string): string {
  return BRAZIL_STATES.find((s) => s.uf === uf)?.name ?? uf;
}

export function isValidUf(uf: string): boolean {
  return UF_CODES.includes(uf);
}

export interface City {
  code: string;
  name: string;
  capital: boolean;
}

export function citiesOf(uf: string): City[] {
  return (dataset.municipalities[uf] ?? []).map(([code, name, capital]) => ({
    code,
    name,
    capital: capital === 1,
  }));
}

/** Retorna o nome oficial do município se ele existir na UF (comparação sem acentos). */
export function findCity(uf: string, name: string): City | null {
  const target = normalizeText(name);
  return citiesOf(uf).find((c) => normalizeText(c.name) === target) ?? null;
}
