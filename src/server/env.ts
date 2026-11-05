import "server-only";
import { z } from "zod";

/** Variáveis de ambiente — só no servidor (nada aqui chega ao navegador). */

// Remove espaços e aspas em volta: no painel da Vercel o valor é usado literalmente.
const texto = z
  .string()
  .optional()
  .transform((v) => v?.trim().replace(/^(["'])(.*)\1$/, "$2").trim() || undefined);

const SERVIDORES_OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const schema = z.object({
  DATABASE_URL: texto.pipe(z.string({ error: "obrigatória" })),
  APP_PASSWORD: texto.pipe(z.string({ error: "obrigatória" }).min(8, "precisa ter pelo menos 8 caracteres")),
  GOOGLE_PLACES_API_KEY: texto,
  GOOGLE_PLACES_URL: z.string().url().default("https://places.googleapis.com/v1/places:searchText"),
  PLACES_DAILY_LIMIT: z.coerce.number().int().min(0).default(30),
  OVERPASS_URL: texto.transform((v) => (v ? v.split(",").map((u) => u.trim()).filter(Boolean) : SERVIDORES_OVERPASS)),
  OSM_CONTACT_EMAIL: texto,
});

export type Env = z.infer<typeof schema>;

/**
 * A integração Neon/Vercel pode criar a conexão com outros nomes (POSTGRES_URL…) ou com um
 * prefixo personalizado (ex.: STORAGE_DATABASE_URL). Aceita qualquer um deles.
 */
export function urlDoBanco(env: Record<string, string | undefined>): string | undefined {
  const nomes = ["DATABASE_URL", "POSTGRES_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"];
  const nome = nomes.find((n) => env[n]?.trim()) ?? Object.keys(env).sort().find((k) => /_(DATABASE_URL|POSTGRES_URL)$/.test(k) && env[k]?.trim());
  return nome ? env[nome] : undefined;
}

let cache: Env | null = null;

export class ConfiguracaoPendenteError extends Error {
  constructor(public readonly problemas: string[]) {
    super(`Configuração pendente: ${problemas.join("; ")}`);
  }
}

export function getEnv(): Env {
  if (cache) return cache;
  const parsed = schema.safeParse({ ...process.env, DATABASE_URL: urlDoBanco(process.env) });
  if (!parsed.success) {
    throw new ConfiguracaoPendenteError(parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`));
  }
  cache = parsed.data;
  return cache;
}

/** Lista o que falta configurar (vazia quando está tudo certo). */
export function problemasDeConfiguracao(): string[] {
  try {
    getEnv();
    return [];
  } catch (error) {
    if (error instanceof ConfiguracaoPendenteError) return error.problemas;
    throw error;
  }
}

/** Para testes: relê process.env. */
export function recarregarEnv(): void {
  cache = null;
}
