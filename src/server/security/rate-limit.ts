import { db } from "@/server/db";
import { RateLimitError } from "@/server/errors";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Janela fixa persistida no Postgres — funciona com várias instâncias da aplicação.
 * Operação atômica (INSERT ... ON CONFLICT).
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const rows = await db.$queryRaw<Array<{ count: number; windowStart: Date }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN 1
        ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE
        WHEN "RateLimitBucket"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN now()
        ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count", "windowStart"
  `;
  const row = rows[0];
  const resetAt = new Date(row.windowStart.getTime() + windowSeconds * 1000);
  return { allowed: row.count <= limit, count: row.count, remaining: Math.max(0, limit - row.count), resetAt };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  const result = await hitRateLimit(key, limit, windowSeconds);
  if (!result.allowed) throw new RateLimitError(message);
  return result;
}

export async function resetRateLimit(key: string) {
  await db.rateLimitBucket.deleteMany({ where: { key } });
}
