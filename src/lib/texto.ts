export function semAcentos(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Minúsculas, sem acentos, sem pontuação e com espaços colapsados — para comparar nomes. */
export function normalizarTexto(valor: string): string {
  return semAcentos(valor)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
