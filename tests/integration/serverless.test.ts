import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { enqueueJob, hasPendingWork } from "@/server/jobs/queue";
import { isWorkerOnline, runJobsFor } from "@/server/jobs/scheduler";
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

  it("detecta tarefas pendentes, ignorando as futuras e as de campanhas pausadas", async () => {
    expect(await hasPendingWork(6)).toBe(false);
    await enqueueJob("followups.scan", {}, { idempotencyKey: "futura", runAt: new Date(Date.now() + 60_000) });
    expect(await hasPendingWork(6)).toBe(false);

    const campaign = await db.campaign.create({
      data: {
        name: "Pausada", state: "SP", city: "Campinas", cityNormalized: "campinas", nicheLabel: "Oficina", searchTerms: ["oficina"],
        targetCount: 5, providers: ["OSM"], progress: {}, status: "PAUSED",
      },
    });
    await enqueueJob("campaign.search", { campaignId: campaign.id }, { campaignId: campaign.id, idempotencyKey: "pausada" });
    expect(await hasPendingWork(6)).toBe(false);

    const job = await enqueueJob("followups.scan", {}, { idempotencyKey: "travada" });
    await db.job.update({ where: { id: job.id }, data: { status: "RUNNING", lockedAt: new Date(Date.now() - 7 * 60_000) } });
    expect(await hasPendingWork(6)).toBe(true); // interrompida: o próximo ciclo devolve à fila
    await db.job.update({ where: { id: job.id }, data: { lockedAt: new Date() } });
    expect(await hasPendingWork(6)).toBe(false); // em execução agora
    await db.job.update({ where: { id: job.id }, data: { status: "QUEUED", lockedAt: null } });
    expect(await hasPendingWork(6)).toBe(true);
  });

  it("processa a fila em faixas paralelas até esvaziar", async () => {
    for (let i = 0; i < 7; i++) await enqueueJob("followups.scan", {}, { idempotencyKey: `scan-${i}` });
    const result = await runJobsFor(30_000, "cron:teste", 3);
    expect(result.processed).toBe(7);
    expect(await db.job.count({ where: { status: "SUCCEEDED" } })).toBe(7);
  });
});
