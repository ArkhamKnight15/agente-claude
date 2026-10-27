import { describe, expect, it } from "vitest";
import { evaluateContactPolicy, nextSendWindow, type ContactContext } from "@/lib/agent/contact-policy";
import { findDuplicate } from "@/lib/agent/dedupe";
import { lintOutboundMessage } from "@/lib/agent/message-lint";
import { buildTemplateAnalysis } from "@/lib/agent/message-templates";
import { classifyReplyByRules } from "@/lib/agent/reply-classifier";
import { computeLeadScore, type ScoringInput } from "@/lib/agent/scoring";
import { DEFAULT_CONTACT_POLICY } from "@/lib/settings-schema";
import type { CommercialContext, LeadFacts } from "@/lib/agent/lead-facts";

const thresholds = { highPriorityMin: 70, mediumPriorityMin: 45 };
const baseScore: ScoringInput = {
  websiteStatus: "NO_WEBSITE_CONFIRMED",
  websiteConfidence: "CONFIRMED",
  businessStatus: "OPERATIONAL",
  hasPhone: true,
  phoneIsMobile: true,
  hasWhatsapp: false,
  hasEmail: false,
  hasSocialProfile: true,
  rating: 4.7,
  reviewCount: 60,
  nicheFit: 9,
};

describe("pontuação de leads", () => {
  it("dá alta prioridade a negócio ativo, sem site confirmado e com contato", () => {
    const r = computeLeadScore(baseScore, thresholds);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.priority).toBe("HIGH");
    expect(r.factors.reduce((s, f) => s + f.max, 0)).toBe(100);
    expect(r.factors.every((f) => f.detail.length > 0)).toBe(true);
  });

  it("desqualifica quem já tem site profissional", () => {
    const r = computeLeadScore({ ...baseScore, websiteStatus: "PROFESSIONAL_WEBSITE" }, thresholds);
    expect(r.priority).toBe("LOW");
    expect(r.disqualified).toBe(true);
  });

  it("desqualifica empresa fechada definitivamente", () => {
    const r = computeLeadScore({ ...baseScore, businessStatus: "CLOSED_PERMANENTLY" }, thresholds);
    expect(r.disqualified).toBe(true);
    expect(r.priority).toBe("LOW");
  });

  it("limita a prioridade a média quando não há canal de contato", () => {
    const r = computeLeadScore({ ...baseScore, hasPhone: false, phoneIsMobile: false, hasEmail: false, hasWhatsapp: false, reviewCount: 200 }, { highPriorityMin: 50, mediumPriorityMin: 30 });
    expect(r.priority).toBe("MEDIUM");
    expect(r.caps.join(" ")).toMatch(/canal de contato/);
  });

  it("pontua menos quando a ausência de site é apenas provável", () => {
    const confirmed = computeLeadScore(baseScore, thresholds).score;
    const likely = computeLeadScore({ ...baseScore, websiteStatus: "NO_WEBSITE_LIKELY", websiteConfidence: "PROBABLE" }, thresholds).score;
    expect(likely).toBeLessThan(confirmed);
  });
});

describe("classificação de respostas", () => {
  it.each([
    ["Por favor, não me mande mais mensagens", "OPT_OUT"],
    ["SAIR", "OPT_OUT"],
    ["remover meu número", "OPT_OUT"],
    ["Não tenho interesse, obrigado", "NOT_INTERESTED"],
    ["já tenho site", "NOT_INTERESTED"],
    ["Tenho interesse sim, quanto fica?", "INTERESTED"],
    ["Qual o valor?", "QUESTION"],
    ["sim", "INTERESTED"],
    ["bom dia", "NEUTRAL"],
  ])("“%s” → %s", (text, expected) => {
    expect(classifyReplyByRules(text).classification).toBe(expected);
  });

  it("prioriza opt-out mesmo com palavras de interesse", () => {
    expect(classifyReplyByRules("quero sim que pare de mandar mensagem").classification).toBe("OPT_OUT");
  });
});

const ctx = (over: Partial<ContactContext> = {}): ContactContext => ({
  channel: "WHATSAPP",
  purpose: "INITIAL",
  method: "API",
  body: "Olá! Posso mostrar uma ideia de site?",
  lead: { stage: "MESSAGE_READY", doNotContact: false, isDemo: false, phoneE164: "+5511987654321", whatsappE164: null, email: null, whatsappOptInAt: new Date() },
  suppressed: false,
  outbound: [],
  lastInboundAt: null,
  sentTodayOnChannel: 0,
  integrationConfigured: true,
  whatsappTemplateConfigured: true,
  ...over,
});
const policy = { ...DEFAULT_CONTACT_POLICY, sendWindowStartHour: 0, sendWindowEndHour: 24, sendWeekdays: [0, 1, 2, 3, 4, 5, 6] };

describe("política de contato", () => {
  it("permite contato válido", () => {
    expect(evaluateContactPolicy(ctx(), policy).allowed).toBe(true);
  });

  it("bloqueia quem pediu para não ser contatado ou está suprimido", () => {
    expect(evaluateContactPolicy(ctx({ suppressed: true }), policy).allowed).toBe(false);
    expect(evaluateContactPolicy(ctx({ lead: { ...ctx().lead, doNotContact: true } }), policy).allowed).toBe(false);
  });

  it("nunca permite envio pela API sem integração configurada (sem simulação)", () => {
    const d = evaluateContactPolicy(ctx({ integrationConfigured: false }), policy);
    expect(d.allowed).toBe(false);
    expect(d.blockers.join(" ")).toMatch(/não configurada/);
  });

  it("exige opt-in para iniciar conversa pela API do WhatsApp", () => {
    const d = evaluateContactPolicy(ctx({ lead: { ...ctx().lead, whatsappOptInAt: null } }), policy);
    expect(d.allowed).toBe(false);
    expect(d.blockers.join(" ")).toMatch(/opt-in/);
  });

  it("dispensa opt-in e modelo dentro da janela de 24h após resposta do cliente", () => {
    const d = evaluateContactPolicy(
      ctx({ purpose: "REPLY", lead: { ...ctx().lead, whatsappOptInAt: null }, whatsappTemplateConfigured: false, lastInboundAt: new Date(Date.now() - 3600_000) }),
      policy,
    );
    expect(d.allowed).toBe(true);
    expect(d.whatsappSessionOpen).toBe(true);
  });

  it("impede insistência: limite de mensagens sem resposta e intervalo mínimo", () => {
    const sentAt = new Date(Date.now() - 86400_000);
    const two = [{ sentAt: new Date(Date.now() - 10 * 86400_000), body: "a", purpose: "INITIAL" as const }, { sentAt: new Date(Date.now() - 5 * 86400_000), body: "b", purpose: "FOLLOW_UP" as const }];
    expect(evaluateContactPolicy(ctx({ outbound: two }), policy).blockers.join(" ")).toMatch(/sem resposta/);
    expect(evaluateContactPolicy(ctx({ outbound: [{ sentAt, body: "x", purpose: "INITIAL" }] }), policy).blockers.join(" ")).toMatch(/menos de/);
  });

  it("bloqueia texto duplicado e limite diário", () => {
    const body = "Mesmo texto";
    const old = [{ sentAt: new Date(Date.now() - 20 * 86400_000), body, purpose: "INITIAL" as const }];
    expect(evaluateContactPolicy(ctx({ body, outbound: old, lead: { ...ctx().lead, stage: "AWAITING_REPLY" } }), { ...policy, maxUnansweredMessages: 5 }).blockers.join(" ")).toMatch(/idêntica/);
    expect(evaluateContactPolicy(ctx({ sentTodayOnChannel: 30 }), policy).allowed).toBe(false);
  });

  it("bloqueia leads de demonstração e negociações encerradas", () => {
    expect(evaluateContactPolicy(ctx({ lead: { ...ctx().lead, isDemo: true } }), policy).allowed).toBe(false);
    expect(evaluateContactPolicy(ctx({ lead: { ...ctx().lead, stage: "LOST" } }), policy).allowed).toBe(false);
  });

  it("adia o envio para a próxima janela em vez de enviar fora do horário", () => {
    const saturday3am = new Date("2026-10-31T06:00:00Z"); // 03:00 em São Paulo
    const next = nextSendWindow(saturday3am, DEFAULT_CONTACT_POLICY)!;
    expect(next.toISOString()).toBe("2026-11-02T12:00:00.000Z"); // segunda, 09:00 em São Paulo
    const d = evaluateContactPolicy(ctx(), DEFAULT_CONTACT_POLICY, saturday3am);
    expect(d.allowed).toBe(true);
    expect(d.deferUntil?.toISOString()).toBe(next.toISOString());
  });
});

describe("conformidade do texto das mensagens", () => {
  const lintCtx = { price: 500, includedFeatures: ["Site responsivo", "Botão de WhatsApp"], maxChars: 600, websiteStatus: "NO_WEBSITE_LIKELY" as const, allowedUrls: ["https://meuportfolio.com.br"] };

  it("alerta promessas fora do pacote, preço divergente, garantias e análises não verificadas", () => {
    const w = lintOutboundMessage("Analisei seu site! Por R$ 300 inclui hospedagem e garanto mais clientes. Veja https://outro.com", lintCtx);
    expect(w.some((x) => /hospedagem/.test(x))).toBe(true);
    expect(w.some((x) => /R\$\s?300/.test(x))).toBe(true);
    expect(w.some((x) => /promessa/.test(x))).toBe(true);
    expect(w.some((x) => /não foi verificado/.test(x))).toBe(true);
    expect(w.some((x) => /link/.test(x))).toBe(true);
  });

  it("aceita mencionar itens como não incluídos", () => {
    expect(lintOutboundMessage("O pacote de R$ 500,00 não inclui hospedagem.", lintCtx)).toEqual([]);
  });
});

describe("mensagens por modelo padrão", () => {
  const facts: LeadFacts = {
    name: "Oficina Silva", category: "Oficina", nicheLabel: "Oficina mecânica", nichePlural: "oficinas mecânicas", nicheNeed: "transmitir confiança",
    nicheBenefits: ["A", "B", "C"], suggestedSections: ["Serviços"], city: "Campinas", state: "SP", source: "GOOGLE_PLACES",
    websiteStatus: "NO_WEBSITE_LIKELY", websiteConfidence: "PROBABLE", websiteIssues: [], websiteSummary: null, hasInstagram: false, hasFacebook: false,
    hasPhone: true, hasEmail: false, rating: 4.5, reviewCount: 20, score: 80, priority: "HIGH", scoreSummary: "80/100",
  };
  const commercial: CommercialContext = {
    price: 500, packageName: "Essencial", deliveryDays: 10, features: ["Site responsivo"], notIncluded: ["Hospedagem"], senderName: "Ana", senderCompany: "Ana Sites",
    portfolioUrl: "", signature: "", tone: "informal", maxChars: 600, includeOptOutHint: true, extraInstructions: "", variant: null,
  };

  it("não afirma ausência de site quando ela não foi confirmada", () => {
    const a = buildTemplateAnalysis(facts, commercial);
    expect(a.whatsappMessage).not.toMatch(/não encontrei um site/);
    expect(a.whatsappMessage).toMatch(/R\$\s?500,00/);
    expect(a.whatsappMessage).toMatch(/não envio mais mensagens/);
    expect(lintOutboundMessage(a.whatsappMessage, { price: 500, includedFeatures: ["Site responsivo"], maxChars: 600, websiteStatus: facts.websiteStatus, allowedUrls: [] })).toEqual([]);
  });

  it("menciona a ausência de site quando confirmada", () => {
    const a = buildTemplateAnalysis({ ...facts, websiteStatus: "NO_WEBSITE_CONFIRMED", websiteConfidence: "CONFIRMED" }, commercial);
    expect(a.whatsappMessage).toMatch(/não encontrei um site próprio/);
  });
});

describe("deduplicação", () => {
  const candidates = [
    { id: "a", normalizedName: "auto center joao", cityNormalized: "campinas", state: "SP", phoneE164: "+5519999990000", websiteUrl: null, latitude: -22.9, longitude: -47.06 },
    { id: "b", normalizedName: "padaria central", cityNormalized: "campinas", state: "SP", phoneE164: null, websiteUrl: "https://padariacentral.com.br", latitude: null, longitude: null },
  ];
  const base = { city: "Campinas", state: "SP", phoneE164: null, websiteUrl: null, latitude: null, longitude: null };

  it("detecta duplicata por telefone, domínio e nome+local", () => {
    expect(findDuplicate({ ...base, name: "Outro nome", phoneE164: "+5519999990000" }, candidates)?.reason).toBe("phone");
    expect(findDuplicate({ ...base, name: "Padaria", websiteUrl: "http://www.padariacentral.com.br/contato" }, candidates)?.reason).toBe("website");
    expect(findDuplicate({ ...base, name: "Auto Center João LTDA" }, candidates)?.id).toBe("a");
  });

  it("não confunde empresas diferentes da mesma cidade", () => {
    expect(findDuplicate({ ...base, name: "Auto Elétrica Pedro" }, candidates)).toBeNull();
    expect(findDuplicate({ ...base, name: "Auto Center João", city: "Sumaré" }, candidates)).toBeNull();
    expect(findDuplicate({ ...base, name: "Auto Center João 2" }, candidates)).toBeNull();
    expect(findDuplicate({ ...base, name: "Auto Center João", phoneE164: "+5519911112222" }, candidates)).toBeNull();
  });
});
