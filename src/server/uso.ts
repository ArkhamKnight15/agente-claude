import "server-only";
import { sql } from "./db";

/** Contador diário de consultas às fontes (dia no fuso de São Paulo). */

const HOJE = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

export async function usoHoje(recurso: string): Promise<number> {
  const [linha] = await sql<{ quantidade: number }>(`SELECT quantidade FROM prospecta_uso WHERE dia = ${HOJE} AND recurso = $1`, [recurso]);
  return linha?.quantidade ?? 0;
}

/** Registra uma consulta se ainda houver cota. `limite` 0 = sem limite. Operação atômica. */
export async function consumirCota(recurso: string, limite: number): Promise<boolean> {
  const linhas = await sql<{ quantidade: number }>(
    `INSERT INTO prospecta_uso (dia, recurso, quantidade) VALUES (${HOJE}, $1, 1)
     ON CONFLICT (dia, recurso) DO UPDATE SET quantidade = prospecta_uso.quantidade + 1
     WHERE $2::int = 0 OR prospecta_uso.quantidade < $2::int
     RETURNING quantidade`,
    [recurso, limite],
  );
  return linhas.length > 0 && (limite === 0 || linhas[0].quantidade <= limite);
}
