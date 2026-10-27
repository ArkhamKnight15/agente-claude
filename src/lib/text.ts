/** Utilitários de normalização de texto usados em deduplicação e comparação de nomes. */

const LEGAL_SUFFIXES = new Set([
  "ltda",
  "me",
  "epp",
  "eireli",
  "mei",
  "sa",
  "s/a",
  "s.a",
  "cia",
  "slu",
  "ss",
]);

const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "para",
  "por",
  "com",
  "the",
  "and",
  "&",
]);

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Minúsculas, sem acentos, sem pontuação e com espaços colapsados. */
export function normalizeText(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nome comercial normalizado, sem sufixos societários (Ltda, ME, EPP...). */
export function normalizeBusinessName(name: string): string {
  const cleaned = stripAccents(name)
    .toLowerCase()
    .replace(/\bs\s*\/\s*a\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !LEGAL_SUFFIXES.has(token));
  return cleaned.join(" ").trim();
}

/** Tokens relevantes do nome (sem stopwords nem sufixos), úteis para casar domínio/título. */
export function nameTokens(name: string): string[] {
  return normalizeBusinessName(name)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function bigrams(value: string): Map<string, number> {
  const compact = value.replace(/\s+/g, "");
  const grams = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i++) {
    const gram = compact.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/** Coeficiente de Sørensen–Dice sobre bigramas (0 a 1). */
export function diceSimilarity(a: string, b: string): number {
  const left = normalizeBusinessName(a);
  const right = normalizeBusinessName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const gramsA = bigrams(left);
  const gramsB = bigrams(right);
  let overlap = 0;
  let total = 0;
  for (const count of gramsA.values()) total += count;
  for (const count of gramsB.values()) total += count;
  for (const [gram, count] of gramsA) {
    overlap += Math.min(count, gramsB.get(gram) ?? 0);
  }
  return total === 0 ? 0 : (2 * overlap) / total;
}

/**
 * Proporção dos caracteres dos tokens do nome que aparecem em um texto compacto
 * (ex.: rótulo de domínio "autocenterjoao"). Retorna 0 a 1.
 */
export function tokenCoverage(name: string, haystack: string): number {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return 0;
  const compact = normalizeText(haystack).replace(/\s+/g, "");
  const totalChars = tokens.reduce((sum, token) => sum + token.length, 0);
  const matchedChars = tokens
    .filter((token) => compact.includes(token))
    .reduce((sum, token) => sum + token.length, 0);
  return matchedChars / totalChars;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-");
}
