import "server-only";
import { Pool, type QueryResultRow } from "pg";
import { getEnv } from "./env";

/**
 * Postgres (Neon na Vercel). As tabelas são criadas automaticamente na primeira consulta —
 * não há migração para rodar. Prefixo "prospecta_" para conviver com outras tabelas do banco.
 */

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS prospecta_contatos (
  id text PRIMARY KEY,
  nome text NOT NULL,
  categoria text,
  nicho text,
  endereco text,
  cidade text NOT NULL,
  uf text NOT NULL,
  telefone text,
  telefone_tipo text NOT NULL DEFAULT 'desconhecido',
  site_status text NOT NULL,
  site_url text,
  site_rotulo text,
  maps_url text,
  avaliacao real,
  avaliacoes integer,
  fonte text NOT NULL,
  status text NOT NULL DEFAULT 'novo',
  observacao text,
  contatado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE prospecta_contatos ADD COLUMN IF NOT EXISTS origem_url text;
ALTER TABLE prospecta_contatos ADD COLUMN IF NOT EXISTS consultado_em timestamptz;
ALTER TABLE prospecta_contatos ADD COLUMN IF NOT EXISTS excluido_em timestamptz;
-- Andamentos antigos: "interessado" vira "respondeu"; "sem interesse" e "não contatar" viram excluídos.
UPDATE prospecta_contatos SET status = 'respondeu' WHERE status = 'interessado';
UPDATE prospecta_contatos SET status = 'enviado', excluido_em = COALESCE(excluido_em, now()) WHERE status IN ('sem_interesse', 'nao_contatar');
CREATE INDEX IF NOT EXISTS prospecta_contatos_telefone ON prospecta_contatos (telefone);
CREATE INDEX IF NOT EXISTS prospecta_contatos_status ON prospecta_contatos (status, atualizado_em DESC);
CREATE TABLE IF NOT EXISTS prospecta_config (chave text PRIMARY KEY, valor jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS prospecta_uso (dia date NOT NULL, recurso text NOT NULL, quantidade integer NOT NULL, PRIMARY KEY (dia, recurso));
CREATE TABLE IF NOT EXISTS prospecta_login (ip text PRIMARY KEY, tentativas integer NOT NULL, janela timestamptz NOT NULL);
`;

const global = globalThis as unknown as { prospectaPool?: Pool; prospectaEsquema?: Promise<void> };

function pool(): Pool {
  global.prospectaPool ??= new Pool({ connectionString: getEnv().DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 });
  return global.prospectaPool;
}

function garantirEsquema(): Promise<void> {
  global.prospectaEsquema ??= pool()
    .query(ESQUEMA)
    .then(() => undefined)
    .catch((error: unknown) => {
      global.prospectaEsquema = undefined; // tenta de novo na próxima consulta
      throw error;
    });
  return global.prospectaEsquema;
}

export async function sql<T extends QueryResultRow>(texto: string, parametros: unknown[] = []): Promise<T[]> {
  await garantirEsquema();
  const resultado = await pool().query<T>(texto, parametros);
  return resultado.rows;
}

/** Executa várias consultas na mesma transação. */
export async function transacao<T>(fn: (q: <R extends QueryResultRow>(texto: string, parametros?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  await garantirEsquema();
  const cliente = await pool().connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await fn(async (texto, parametros = []) => (await cliente.query(texto, parametros)).rows);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

/** Para testes: fecha as conexões. */
export async function encerrarConexoes(): Promise<void> {
  await global.prospectaPool?.end();
  global.prospectaPool = undefined;
  global.prospectaEsquema = undefined;
}
