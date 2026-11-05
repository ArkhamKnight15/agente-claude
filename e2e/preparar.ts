import { Client } from "pg";

/** Começa cada execução com o banco de teste vazio. */
export default async function preparar() {
  const cliente = new Client({ connectionString: process.env.E2E_DATABASE_URL });
  await cliente.connect();
  await cliente.query("DROP TABLE IF EXISTS prospecta_contatos, prospecta_config, prospecta_uso, prospecta_login");
  await cliente.end();
}
