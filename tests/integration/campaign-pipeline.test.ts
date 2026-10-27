import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBusiness, SearchRequest } from "@/server/integrations/sources/types";

/**
 * Fonte de dados de TESTE (substitui Google Places/OSM apenas nesta suíte), para exercitar
 * o fluxo completo sem acesso à internet: pesquisa → dedupe → verificação → qualificação →
 * mensagem na fila de revisão → relatório.
 */
const fixture = (n: number, over: Partial<RawBusiness> = {}): RawBusiness => ({
  provider: "GOOGLE_PLACES",
  externalId: `place-${n}`,
  sourceUrl: null,
  name: `Oficina Teste ${["Alfa", "Beta", "Gama", "Delta", "Épsilon"][n % 5]} ${n}`,
  category: "Oficina mecânica",
  address: `Rua ${n}, Campinas - SP`,
  neighborhood: null,
  city: "Campinas",
  state: "SP",
  postalCode: null,
  latitude: null,
  longitude: null,
  phone: `(19) 98000-00${String(n).padStart(2, "0")}`,
  whatsapp: null,
  email: null,
  website: null,
  instagram: null,
  facebook: null,
  googleMapsUrl: null,
  businessStatus: "OPERATIONAL",
  rating: 4.6,
  reviewCount: 40,
  hasWebsiteField: true,
  ...over,
});

const searchCalls: SearchRequest[] = [];
vi.mock("@/server/integrations/sources", () => {
  const source = {
    provider: "GOOGLE_PLACES",
    label: "Fonte de teste",
    isConfigured: () => true,
    async search(req: SearchRequest) {
      searchCalls.push(req);
      if (req.cursor === "page-2") {
        return {
          items: [
            fixture(4),
            fixture(1, { externalId: "place-dup-phone" }), // mesmo telefone do 1 → duplicata
            fixture(5, { city: "Sumaré" }), // fora da cidade
            fixture(6, { website: "https://www.instagram.com/oficina6" }), // rede social não é site
          ],
          nextCursor: null,
          requests: 1,
        };
      }
      return { items: [fixture(1), fixture(2), fixture(3, { businessStatus: "CLOSED_PERMANENTLY" })], nextCursor: "page-2", requests: 1 };
    },
  };
  return {
    BUSINESS_SOURCES: { GOOGLE_PLACES: source },
    getSource: (p: string) => (p === "GOOGLE_PLACES" ? source : null),
    configuredSources: () => [source],
  };
});

const { db } = await import("@/server/db");
const { resetDatabase, seedBasics } = await import("../helpers/db");
const { createCampaign, pauseCampaign, startCampaign, readProgress } = await import("@/server/services/campaigns");
const { runNextJob } = await import("@/server/jobs/runner");
const { claimNextJob } = await import("@/server/jobs/queue");

async function drainQueue(max = 200) {
  for (let i = 0; i < max; i++) {
    // Libera jobs reagendados (ex.: finalize aguardando) para rodar já.
    await db.job.updateMany({ where: { status: "QUEUED" }, data: { runAt: new Date(Date.now() - 1000) } });
    const result = await runNextJob("test-worker");
    if (!result) return i;
  }
  throw new Error("Fila não esvaziou.");
}

describe("pipeline de campanha (integração)", () => {
  let adminId: string;

  beforeEach(async () => {
    await resetDatabase();
    adminId = (await seedBasics()).admin.id;
    searchCalls.length = 0;
  });

  it("pesquisa, deduplica, verifica, qualifica e prepara mensagens para revisão — sem enviar nada", async () => {
    const campaign = await createCampaign(
      { state: "SP", city: "campinas", nicheKey: "oficina-mecanica", targetCount: 10, minPriority: "MEDIUM", onlyWithoutWebsite: true, providers: ["GOOGLE_PLACES"], preferredChannel: "WHATSAPP", abTestEnabled: false },
      adminId,
    );
    expect(campaign.status).toBe("RUNNING");
    expect(campaign.city).toBe("Campinas"); // nome oficial do IBGE

    await drainQueue();

    const finished = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    const progress = readProgress(finished);
    expect(finished.status).toBe("COMPLETED");
    expect(progress.searchDone).toBe(true);
    // O nicho tem 3 termos de busca; a fonte de teste devolve as mesmas 2 páginas para cada termo.
    expect(progress.apiRequests).toBe(6);
    expect(progress.outsideArea).toBe(3);
    expect(progress.duplicates).toBe(13); // repetidos entre termos + mesmo telefone
    expect(progress.created).toBe(5); // 1, 2, 3, 4, 6

    const leads = await db.lead.findMany({ orderBy: { name: "asc" } });
    expect(leads).toHaveLength(5);
    // Sem busca web configurada, a ausência de site nunca é "confirmada".
    expect(leads.every((l) => l.websiteStatus === "NO_WEBSITE_LIKELY")).toBe(true);
    const lead6 = leads.find((l) => l.name.endsWith(" 6"))!;
    expect(lead6.instagramUrl).toMatch(/instagram/);
    expect(lead6.websiteUrl).toBeNull();

    const closed = leads.find((l) => l.businessStatus === "CLOSED_PERMANENTLY")!;
    expect(closed.priority).toBe("LOW");

    const messages = await db.message.findMany();
    expect(messages.length).toBe(4); // todos menos o fechado
    expect(messages.every((m) => m.status === "PENDING_APPROVAL" && m.sentAt === null)).toBe(true);
    expect(messages.every((m) => m.generatedBy === "template")).toBe(true);
    expect(messages[0].body).toMatch(/R\$\s?500,00/);

    expect(finished.report).toMatchObject({ leads: 5, messagesDrafted: 4, messagesSent: 0 });
    const checks = await db.websiteCheck.count();
    expect(checks).toBe(5);
    // Cada termo: duas páginas, com o cursor salvo entre elas.
    expect(searchCalls.map((c) => c.cursor ?? null)).toEqual([null, "page-2", null, "page-2", null, "page-2"]);
    expect(new Set(searchCalls.map((c) => c.term)).size).toBe(3);
  });

  it("pausar impede a execução das tarefas da campanha; retomar continua de onde parou", async () => {
    const campaign = await createCampaign(
      { state: "SP", city: "Campinas", nicheKey: "oficina-mecanica", targetCount: 10, minPriority: "MEDIUM", onlyWithoutWebsite: true, providers: ["GOOGLE_PLACES"], preferredChannel: "WHATSAPP", abTestEnabled: false },
      adminId,
    );
    await pauseCampaign(campaign.id, adminId);
    expect(await claimNextJob("w")).toBeNull();
    expect(await db.lead.count()).toBe(0);

    await startCampaign(campaign.id, adminId);
    await drainQueue();
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("COMPLETED");
    expect(await db.lead.count()).toBe(5);
  });

  it("retoma após queda do worker sem duplicar leads", async () => {
    const campaign = await createCampaign(
      { state: "SP", city: "Campinas", nicheKey: "oficina-mecanica", targetCount: 10, minPriority: "MEDIUM", onlyWithoutWebsite: true, providers: ["GOOGLE_PLACES"], preferredChannel: "WHATSAPP", abTestEnabled: false },
      adminId,
    );
    // Simula um worker que reivindicou a pesquisa e morreu.
    const job = await claimNextJob("worker-que-caiu");
    expect(job?.type).toBe("campaign.search");
    await db.job.update({ where: { id: job!.id }, data: { lockedAt: new Date(Date.now() - 20 * 60_000) } });
    const { recoverStaleJobs } = await import("@/server/jobs/queue");
    expect(await recoverStaleJobs(10)).toBe(1);
    await drainQueue();
    expect(await db.lead.count()).toBe(5);
    expect(await db.campaignLead.count({ where: { campaignId: campaign.id } })).toBe(5);
  });

  it("pesquisa longa é executada em partes (limite de tempo de funções serverless)", async () => {
    process.env.JOB_SLICE_MS = "0";
    const { resetEnvCache } = await import("@/server/env");
    resetEnvCache();
    try {
      const campaign = await createCampaign(
        { state: "SP", city: "Campinas", nicheKey: "oficina-mecanica", targetCount: 10, minPriority: "MEDIUM", onlyWithoutWebsite: true, providers: ["GOOGLE_PLACES"], preferredChannel: "WHATSAPP", abTestEnabled: false },
        adminId,
      );
      await drainQueue();
      const finished = await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
      expect(finished.status).toBe("COMPLETED");
      expect(await db.lead.count()).toBe(5);
      expect(searchCalls.map((c) => c.cursor ?? null)).toEqual([null, "page-2", null, "page-2", null, "page-2"]);
    } finally {
      delete process.env.JOB_SLICE_MS;
      resetEnvCache();
    }
  });

  it("não aborda novamente quem já está em negociação ou pediu para não ser contatado", async () => {
    const first = await createCampaign(
      { state: "SP", city: "Campinas", nicheKey: "oficina-mecanica", targetCount: 10, minPriority: "MEDIUM", onlyWithoutWebsite: true, providers: ["GOOGLE_PLACES"], preferredChannel: "WHATSAPP", abTestEnabled: false },
      adminId,
    );
    await drainQueue();
    const lead = await db.lead.findFirstOrThrow({ where: { messages: { some: {} } } });
    await db.lead.update({ where: { id: lead.id }, data: { stage: "NEGOTIATION" } });

    await createCampaign(
      { name: "Segunda", state: "SP", city: "Campinas", nicheKey: "oficina-mecanica", targetCount: 10, minPriority: "MEDIUM", onlyWithoutWebsite: true, providers: ["GOOGLE_PLACES"], preferredChannel: "WHATSAPP", abTestEnabled: false },
      adminId,
    );
    await drainQueue();
    const link = await db.campaignLead.findFirstOrThrow({ where: { leadId: lead.id, campaignId: { not: first.id } } });
    expect(link.status).toBe("SKIPPED");
    expect(await db.message.count({ where: { leadId: lead.id } })).toBe(1);
  });
});
