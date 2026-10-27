import { db } from "@/server/db";
import { AppError } from "@/server/errors";

/** Limite diário de chamadas a APIs pagas/limitadas (evita pesquisas ilimitadas). */
export class QuotaExceededError extends AppError {
  constructor(public readonly provider: string, limit: number) {
    super(
      `Limite diário de ${limit} chamadas para ${provider} atingido. Ajuste o limite nas variáveis de ambiente ou continue amanhã.`,
      "QUOTA_EXCEEDED",
      429,
    );
  }
}

function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function consumeQuota(provider: string, limit: number, amount = 1): Promise<number> {
  const day = today();
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "ApiUsage" ("provider", "day", "count") VALUES (${provider}, ${day}, ${amount})
    ON CONFLICT ("provider", "day") DO UPDATE SET "count" = "ApiUsage"."count" + ${amount}
    RETURNING "count"
  `;
  const count = rows[0]?.count ?? amount;
  if (count > limit) {
    await db.$executeRaw`UPDATE "ApiUsage" SET "count" = "count" - ${amount} WHERE "provider" = ${provider} AND "day" = ${day}`;
    throw new QuotaExceededError(provider, limit);
  }
  return count;
}

export async function usageToday(): Promise<Record<string, number>> {
  const rows = await db.apiUsage.findMany({ where: { day: today() } });
  return Object.fromEntries(rows.map((r) => [r.provider, r.count]));
}
