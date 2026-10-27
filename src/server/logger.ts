/**
 * Logger estruturado (JSON em produção, legível em desenvolvimento).
 * Campos com nomes sensíveis são mascarados automaticamente.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /(pass(word)?|secret|token|authorization|api[-_]?key|cookie|phone|email|e164)/i;

const minLevel: Level = (process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(val, depth + 1);
  }
  return out;
}

function write(level: Level, scope: string, message: string, context?: Record<string, unknown>) {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify(entry)
      : `${entry.ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${
          context ? ` ${JSON.stringify(redact(context))}` : ""
        }`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope: string) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", scope, msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => write("info", scope, msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", scope, msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => write("error", scope, msg, ctx),
  };
}

export type Logger = ReturnType<typeof createLogger>;
