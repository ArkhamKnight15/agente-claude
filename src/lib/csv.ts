/** Geração de CSV compatível com Excel (pt-BR: separador ";" e BOM UTF-8). */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined | Date;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown, separator = ";"): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Evita injeção de fórmulas ao abrir no Excel/Sheets.
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (text.includes(separator) || text.includes('"') || /[\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], separator = ";"): string {
  const header = columns.map((c) => escapeCsvCell(c.header, separator)).join(separator);
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(c.value(row), separator)).join(separator),
  );
  return `﻿${[header, ...lines].join("\r\n")}\r\n`;
}
