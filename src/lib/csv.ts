/** CSV compatível com Excel (separador ";", BOM UTF-8) e protegido contra injeção de fórmulas. */

function celula(valor: unknown): string {
  let texto = valor === null || valor === undefined ? "" : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function gerarCsv(cabecalho: string[], linhas: unknown[][]): string {
  return `﻿${[cabecalho, ...linhas].map((linha) => linha.map(celula).join(";")).join("\r\n")}\r\n`;
}
