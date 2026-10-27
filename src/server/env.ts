import { z } from "zod";

/**
 * Variáveis de ambiente validadas. Segredos ficam apenas no servidor — nada aqui
 * é exposto ao navegador (não usamos o prefixo NEXT_PUBLIC_).
 */

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const int = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : fallback))
    .pipe(z.number().int().nonnegative());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32, "APP_SECRET deve ter pelo menos 32 caracteres"),
  SESSION_TTL_DAYS: int(7),

  // IA (Claude API)
  ANTHROPIC_API_KEY: optional,
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  LLM_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),

  // Fontes de empresas
  GOOGLE_PLACES_API_KEY: optional,
  PLACES_DAILY_LIMIT: int(300),
  OSM_ENABLED: bool(true),
  OVERPASS_URL: z.string().url().default("https://overpass-api.de/api/interpreter"),
  OSM_CONTACT_EMAIL: optional,

  // Busca web (verificação de sites)
  SEARCH_PROVIDER: z.enum(["brave", "serper", "google_cse"]).optional().or(z.literal("").transform(() => undefined)),
  BRAVE_SEARCH_API_KEY: optional,
  SERPER_API_KEY: optional,
  GOOGLE_CSE_API_KEY: optional,
  GOOGLE_CSE_CX: optional,
  SEARCH_DAILY_LIMIT: int(200),

  // WhatsApp Business Platform (Cloud API oficial da Meta)
  WHATSAPP_ACCESS_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  WHATSAPP_BUSINESS_ACCOUNT_ID: optional,
  WHATSAPP_APP_SECRET: optional,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: optional,
  WHATSAPP_API_VERSION: z.string().default("v23.0"),
  WHATSAPP_TEMPLATE_NAME: optional,
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default("pt_BR"),
  // Ordem das variáveis {{1}}, {{2}}... do modelo: lead_name, city, sender_name, sender_company
  WHATSAPP_TEMPLATE_PARAMS: z.string().default("lead_name"),
  WHATSAPP_GRAPH_URL: z.string().url().default("https://graph.facebook.com"),

  // E-mail
  SMTP_HOST: optional,
  SMTP_PORT: int(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  EMAIL_FROM: optional,
  EMAIL_REPLY_TO: optional,
  IMAP_HOST: optional,
  IMAP_PORT: int(993),
  IMAP_SECURE: bool(true),
  IMAP_USER: optional,
  IMAP_PASSWORD: optional,
  IMAP_MAILBOX: z.string().default("INBOX"),

  // Worker
  WORKER_CONCURRENCY: int(3),
  WORKER_POLL_MS: int(1500),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração inválida das variáveis de ambiente — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Usado nos testes para recarregar o ambiente após alterar process.env. */
export function resetEnvCache() {
  cached = null;
}

export const isProduction = () => getEnv().NODE_ENV === "production";
