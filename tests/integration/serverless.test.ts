import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { enqueueJob } from "@/server/jobs/queue";
import { isWorkerOnline } from "@/server/jobs/scheduler";
import { resetDatabase, seedBasics } from "../helpers/db";
import { GET } from "@/app/api/cron/run-jobs/route";

const call = (headers: Record<string, string> = {}, query = "?wait=1") => GET(new Request(`http://localhost/api/cron/run-jobs${query}`, { headers }));

describe("execução serverless (Vercel)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedBasics();
    process.env.CRON_SECRET = "segredo-do-cron-para-testes";
    resetEnvCache();
  });

  it("exige CRON_SECRET configurado e o cabeçalho correto", async () => {
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer errado" })).status).toBe(401);
    delete process.env.CRON_SECRET;
    resetEnvCache();
    expect((await call({ authorization: "Bearer qualquer" })).status).toBe(503);
  });

  it("processa a fila, agenda rotinas e registra o sinal de vida", async () => {
    await enqueueJob("followups.scan", {}, { idempotencyKey: "manual-scan" });
    const res = await call({ authorization: "Bearer segredo-do-cron-para-testes" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBeGreaterThanOrEqual(2); // tarefa manual + rotinas recorrentes
    expect(await db.job.count({ where: { status: "QUEUED" } })).toBe(0);
    const hb = await db.workerHeartbeat.findUniqueOrThrow({ where: { id: "cron:cron" } });
    expect(isWorkerOnline(hb)).toBe(true);
    expect(isWorkerOnline({ id: "cron:cron", lastSeenAt: new Date(Date.now() - 20 * 60_000) })).toBe(false);
    expect(isWorkerOnline({ id: "host:1", lastSeenAt: new Date(Date.now() - 2 * 60_000) })).toBe(false);
  });
});
