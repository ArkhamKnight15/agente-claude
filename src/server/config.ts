import "server-only";
import { CONFIG_PADRAO } from "@/lib/mensagem";
import type { ConfigMensagem } from "@/types";
import { sql } from "./db";

/** Configuração da mensagem — guardada no banco para valer no computador e no celular. */

export async function lerConfig(): Promise<ConfigMensagem> {
  const [linha] = await sql<{ valor: Partial<ConfigMensagem> }>("SELECT valor FROM prospecta_config WHERE chave = 'mensagem'");
  return { ...CONFIG_PADRAO, ...linha?.valor };
}

export async function salvarConfig(config: ConfigMensagem): Promise<void> {
  await sql(
    `INSERT INTO prospecta_config (chave, valor) VALUES ('mensagem', $1)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor`,
    [JSON.stringify(config)],
  );
}
