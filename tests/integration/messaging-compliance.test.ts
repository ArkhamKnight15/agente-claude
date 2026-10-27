import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Dublê da IA apenas para o teste do caminho "com IA" (sem chamadas externas).
const aiResponses: unknown[] = [];
vi.mock("@/server/integrations/llm", () => ({
  isLlmConfigured: () => aiResponses.length > 0,
  llmModel: () => "modelo-de-teste",
  generateStructured: vi.fn(async () => {
    const data = aiResponses.shift();
    if (!data) throw new Error("sem resposta simulada");
    return { data, model: "modelo-de-teste", inputTokens: 1, outputTokens: 1 };
  }),
  pingLlm: vi.fn(),
}));

const { db } = await import("@/server/db");
const { resetDatabase, seedBasics } = await import("../helpers/db");
const { draftInitialMessage, generateLeadAnalysis } = await import("@/server/agent/lead-agent");
const { approveMessage, queueApiSend, markSentManually, evaluateMessagePolicy } = await import("@/server/services/messages");
const { runNextJob } = await import("@/server/jobs/runner");
const { unsubscribeByToken } = await import("@/server/services/unsubscribe");
const { signToken } = await import("@/server/security/crypto");
const { createProposal, approveProposal, markProposalSentManually, setProposalOutcome } = await import("@/server/services/proposals");
const { renderProposalPdf } = await import("@/server/pdf/proposal-pdf");
const { eraseLead } = await import("@/server/services/leads");
const { isSuppressed } = await import("@/server/services/suppression");
const { getDashboardMetrics } = await import("@/server/services/metrics");
const webhook = await import("@/app/api/webhooks/whatsapp/route");

async function createLead(over: Record<string, unknown> = {}) {
  return db.lead.create({
    data: {
      name: "Barbearia Navalha",
      normalizedName: "barbearia navalha",
      nicheKey: "barbearia",
      city: "Campinas",
      cityNormalized: "campinas",
      state: "SP",
      phone: "(19) 98888-7777",
      phoneE164: "+5519988887777",
      phoneType: "MOBILE",
      email: "contato@navalha.example",
      primarySource: "GOOGLE_PLACES",
      websiteStatus: "NO_WEBSITE_CONFIRMED",
      websiteConfidence: "CONFIRMED",
      businessStatus: "OPERATIONAL",
      stage: "QUALIFIED",
      ...over,
    },
  });
}

async function postWebhook(payload: object) {
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", process.env.WHATSAPP_APP_SECRET!).update(body).digest("hex")}`;
  return webhook.POST(new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": signature } }));
}

const inbound = (text: string, id: string, from = "5519988887777") => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: from, profile: { name: "Cliente" } }], messages: [{ id, from, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }] } }] }],
});

describe("mensagens e conformidade (integração)", () => {
  let adminId: string;
  beforeEach(async () => {
    await resetDatabase();
    adminId = (await seedBasics()).admin.id;
    aiResponses.length = 0;
  });

  it("aprovação manual; sem integração configurada a API não envia e nada é simulado", async () => {
    const lead = await createLead();
    const message = await draftInitialMessage(lead.id, { preferredChannel: "WHATSAPP" });
    expect(message.status).toBe("PENDING_APPROVAL");
    await expect(queueApiSend(message.id, adminId)).rejects.toThrow(/Aprove/);
    await approveMessage(message.id, adminId);
    await expect(queueApiSend(message.id, adminId)).rejects.toThrow(/não configurada/);
    expect((await db.message.findUniqueOrThrow({ where: { id: message.id } })).sentAt).toBeNull();

    await markSentManually(message.id, adminId);
    const sent = await db.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(sent).toMatchObject({ status: "SENT", sendMethod: "MANUAL" });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("CONTACTED");
    expect(await db.auditLog.count({ where: { action: "message.mark_sent_manual" } })).toBe(1);
  });

  it("resposta “interessado” pelo webhook atualiza o funil e cria tarefa", async () => {
    const lead = await createLead({ stage: "CONTACTED" });
    const res = await postWebhook(inbound("Oi! Tenho interesse, quanto fica?", "wamid.in1"));
    expect(res.status).toBe(200);
    // Reenvio do mesmo evento é ignorado (idempotência).
    await postWebhook(inbound("Oi! Tenho interesse, quanto fica?", "wamid.in1"));
    expect(await db.message.count({ where: { direction: "INBOUND" } })).toBe(1);

    await runNextJob("t"); // inbound.process
    const updated = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.stage).toBe("INTERESTED");
    expect(await db.followUpTask.count({ where: { leadId: lead.id, type: "REPLY", status: "OPEN" } })).toBe(1);
  });

  it("webhook com assinatura inválida é rejeitado", async () => {
    const res = await webhook.POST(new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", body: "{}", headers: { "x-hub-signature-256": "sha256=errada" } }));
    expect(res.status).toBe(401);
    const verify = await webhook.GET(new Request("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token-for-tests&hub.challenge=123"));
    expect(await verify.text()).toBe("123");
  });

  it("pedido para parar bloqueia novos contatos, cancela pendências e sobrevive à exclusão dos dados", async () => {
    const lead = await createLead({ stage: "CONTACTED" });
    const pending = await draftInitialMessage(lead.id, { channel: "EMAIL" });
    await postWebhook(inbound("Por favor, pare de mandar mensagens", "wamid.stop"));
    await runNextJob("t");

    const blocked = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(blocked).toMatchObject({ doNotContact: true, stage: "DO_NOT_CONTACT" });
    expect((await db.message.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("CANCELLED");
    await expect(draftInitialMessage(lead.id, { channel: "WHATSAPP" })).rejects.toThrow(/não receber/);

    await eraseLead(lead.id, adminId, "Pedido do titular");
    expect(await db.lead.count()).toBe(0);
    expect(await isSuppressed({ phoneE164: "+5519988887777" })).toBe(true);
    // Um novo cadastro com o mesmo telefone continua bloqueado.
    const again = await createLead();
    const draft = await db.message.create({ data: { leadId: again.id, channel: "WHATSAPP", direction: "OUTBOUND", status: "APPROVED", body: "Olá", toAddress: "+5519988887777" } });
    const decision = await evaluateMessagePolicy(draft, "MANUAL");
    expect(decision.allowed).toBe(false);
    expect(decision.blockers.join(" ")).toMatch(/supressão/);
  });

  it("número desconhecido pedindo para sair também entra na supressão", async () => {
    await postWebhook(inbound("sair", "wamid.unknown", "5521977776666"));
    expect(await isSuppressed({ phoneE164: "+5521977776666" })).toBe(true);
  });

  it("descadastro pelo link do e-mail", async () => {
    const lead = await createLead();
    expect(await unsubscribeByToken("token-invalido")).toBe("invalid");
    expect(await unsubscribeByToken(signToken({ l: lead.id }, "unsubscribe"))).toBe("done");
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).doNotContact).toBe(true);
  });

  it("caminho com IA: usa a saída validada e aponta promessas fora do pacote", async () => {
    const lead = await createLead();
    aiResponses.push({
      classificationReason: "Sem site, negócio ativo.",
      identifiedNeed: "Agendamento online.",
      benefits: ["Agenda pelo WhatsApp", "Aparecer no Google"],
      salesArgument: "Site simples e acessível.",
      whatsappMessage: "Oi! Faço sites a partir de R$ 500,00 com hospedagem inclusa. Posso mostrar?",
      emailSubject: "Site para a Barbearia Navalha",
      emailBody: "Olá! Crio sites a partir de R$ 500,00.",
      nextAction: "Enviar WhatsApp.",
    });
    const analysis = await generateLeadAnalysis(lead.id);
    expect(analysis.generatedBy).toBe("ai:modelo-de-teste");
    expect(analysis.warnings.join(" ")).toMatch(/hospedagem/);

    // IA indisponível → modelo padrão, com o erro registrado.
    aiResponses.length = 0;
    const fallback = await generateLeadAnalysis(lead.id);
    expect(fallback.generatedBy).toBe("template");
  });

  it("proposta: aprovação obrigatória, PDF real e venda fechada atualiza métricas", async () => {
    const lead = await createLead({ stage: "INTERESTED" });
    const proposal = await createProposal(lead.id, null, adminId);
    expect(proposal.status).toBe("DRAFT");
    expect(Number(proposal.price)).toBe(500);
    await expect(markProposalSentManually(proposal.id, adminId)).rejects.toThrow(/aprovada/);
    await approveProposal(proposal.id, adminId);

    const pdf = await renderProposalPdf(proposal.id);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);

    await markProposalSentManually(proposal.id, adminId);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("PROPOSAL_SENT");
    await setProposalOutcome(proposal.id, "ACCEPTED", adminId);
    const won = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(won.stage).toBe("WON");
    expect(Number(won.dealValue)).toBe(500);

    const metrics = await getDashboardMetrics();
    expect(metrics.won).toBe(1);
    expect(metrics.realizedRevenue).toBe(500);
    expect(metrics.proposalsSent).toBe(1);
  });
});
