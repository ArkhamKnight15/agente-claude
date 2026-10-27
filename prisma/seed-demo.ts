import "dotenv/config";
import type { LeadStage, ReplyClassification, WebsiteStatus } from "@/generated/prisma/enums";
import { computeLeadScore } from "@/lib/agent/scoring";
import { buildTemplateAnalysis } from "@/lib/agent/message-templates";
import { DEFAULT_AGENT_SETTINGS } from "@/lib/settings-schema";
import { normalizeBusinessName, normalizeText, slugify } from "@/lib/text";
import { getNiche } from "@/data/niches";
import { db } from "@/server/db";

/**
 * DADOS DE DEMONSTRAÇÃO — opcional (npm run db:seed:demo).
 * Empresas fictícias, marcadas com isDemo=true e "(demonstração)" no nome, sem telefone e
 * com e-mails no domínio reservado ".example" (RFC 2606). Envios reais para esses leads
 * são bloqueados pela política de contato. Remova em Configurações → Dados de demonstração.
 */

interface DemoLead {
  name: string;
  niche: string;
  city: string;
  state: string;
  website: WebsiteStatus;
  stage: LeadStage;
  reviews: number;
  rating: number;
  instagram?: boolean;
  reply?: { text: string; classification: ReplyClassification };
  daysAgo: number;
  won?: number;
}

const LEADS: DemoLead[] = [
  { name: "Estética Automotiva Brilho Exemplo", niche: "estetica-automotiva", city: "Campinas", state: "SP", website: "NO_WEBSITE_CONFIRMED", stage: "MESSAGE_READY", reviews: 87, rating: 4.8, instagram: true, daysAgo: 1 },
  { name: "Lava Rápido Modelo Centro", niche: "estetica-automotiva", city: "Campinas", state: "SP", website: "NO_WEBSITE_LIKELY", stage: "MESSAGE_READY", reviews: 34, rating: 4.5, daysAgo: 1 },
  { name: "Oficina Mecânica Fictícia Silva", niche: "oficina-mecanica", city: "Campinas", state: "SP", website: "NO_WEBSITE_CONFIRMED", stage: "AWAITING_REPLY", reviews: 120, rating: 4.6, daysAgo: 6 },
  { name: "Auto Center Exemplo Norte", niche: "oficina-mecanica", city: "São Paulo", state: "SP", website: "WEBSITE_WITH_ISSUES", stage: "INTERESTED", reviews: 64, rating: 4.4, reply: { text: "Oi! Tenho interesse sim, quanto fica e o que inclui?", classification: "INTERESTED" }, daysAgo: 9 },
  { name: "Funilaria Demonstrativa Pereira", niche: "funilaria", city: "São Paulo", state: "SP", website: "NO_WEBSITE_CONFIRMED", stage: "NEGOTIATION", reviews: 41, rating: 4.7, reply: { text: "Pode mandar uma ideia de como ficaria", classification: "INTERESTED" }, daysAgo: 12 },
  { name: "Barbearia Modelo Vintage", niche: "barbearia", city: "Belo Horizonte", state: "MG", website: "NO_WEBSITE_CONFIRMED", stage: "WON", reviews: 210, rating: 4.9, instagram: true, reply: { text: "Fechado, vamos fazer!", classification: "INTERESTED" }, daysAgo: 20, won: 500 },
  { name: "Barbearia Exemplo do Bairro", niche: "barbearia", city: "Belo Horizonte", state: "MG", website: "NO_WEBSITE_LIKELY", stage: "LOST", reviews: 18, rating: 4.2, reply: { text: "Não tenho interesse, obrigado", classification: "NOT_INTERESTED" }, daysAgo: 15 },
  { name: "Clínica Odontológica Sorriso Exemplo", niche: "clinica-odontologica", city: "Curitiba", state: "PR", website: "WEBSITE_WITH_ISSUES", stage: "PROPOSAL_SENT", reviews: 95, rating: 4.8, reply: { text: "Como funciona o prazo? Gostaria de ver uma proposta.", classification: "INTERESTED" }, daysAgo: 18 },
  { name: "Consultório Dental Fictício", niche: "clinica-odontologica", city: "Curitiba", state: "PR", website: "PROFESSIONAL_WEBSITE", stage: "FOUND", reviews: 300, rating: 4.9, daysAgo: 3 },
  { name: "Salão de Beleza Modelo Bela", niche: "salao-de-beleza", city: "Recife", state: "PE", website: "NO_WEBSITE_CONFIRMED", stage: "DO_NOT_CONTACT", reviews: 52, rating: 4.6, reply: { text: "Por favor não me mande mais mensagens", classification: "OPT_OUT" }, daysAgo: 10 },
  { name: "Studio de Estética Exemplo", niche: "clinica-estetica", city: "Recife", state: "PE", website: "NO_WEBSITE_CONFIRMED", stage: "AWAITING_REPLY", reviews: 29, rating: 4.7, instagram: true, daysAgo: 5 },
  { name: "Restaurante Sabor Demonstração", niche: "restaurante", city: "Recife", state: "PE", website: "INCONCLUSIVE", stage: "QUALIFIED", reviews: 410, rating: 4.3, daysAgo: 2 },
  { name: "Academia Exemplo Fitness", niche: "academia", city: "São Paulo", state: "SP", website: "WEBSITE_WITH_ISSUES", stage: "CONTACTED", reviews: 150, rating: 4.4, daysAgo: 1 },
  { name: "Limpeza Pós-Obra Modelo", niche: "empresa-de-limpeza", city: "Belo Horizonte", state: "MG", website: "NO_WEBSITE_CONFIRMED", stage: "AWAITING_REPLY", reviews: 12, rating: 5, daysAgo: 7 },
  { name: "Eletricista Exemplo Serviços", niche: "prestador-de-servicos", city: "Curitiba", state: "PR", website: "NO_WEBSITE_LIKELY", stage: "MESSAGE_READY", reviews: 8, rating: 4.9, daysAgo: 1 },
  { name: "Construtora Fictícia Alicerce", niche: "construcao", city: "São Paulo", state: "SP", website: "PROFESSIONAL_WEBSITE", stage: "FOUND", reviews: 60, rating: 4.1, daysAgo: 4 },
  { name: "Imobiliária Exemplo Lar", niche: "imobiliaria", city: "Campinas", state: "SP", website: "WEBSITE_WITH_ISSUES", stage: "QUALIFIED", reviews: 44, rating: 4.3, daysAgo: 2 },
  { name: "Assistência Técnica Modelo", niche: "manutencao", city: "Belo Horizonte", state: "MG", website: "NO_WEBSITE_CONFIRMED", stage: "INTERESTED", reviews: 70, rating: 4.5, reply: { text: "Qual o valor? Aceita parcelar?", classification: "QUESTION" }, daysAgo: 4 },
];

const DAY = 86400_000;

async function main() {
  const existing = await db.lead.count({ where: { isDemo: true } });
  if (existing > 0) {
    console.log(`• Já existem ${existing} leads de demonstração. Remova-os antes de recriar.`);
    return;
  }
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  const pkg = await db.servicePackage.findFirst({ where: { isDefault: true } });
  if (!admin || !pkg) throw new Error("Execute npm run db:seed antes do seed de demonstração.");

  const campaign = await db.campaign.create({
    data: {
      name: "Demonstração — campanha de exemplo",
      state: "SP",
      city: "Campinas",
      cityNormalized: normalizeText("Campinas"),
      nicheKey: "estetica-automotiva",
      nicheLabel: "Estética automotiva",
      searchTerms: ["estética automotiva"],
      targetCount: 20,
      providers: ["GOOGLE_PLACES"],
      status: "COMPLETED",
      progress: { run: 1, searchDone: true, found: 26, linked: LEADS.length, created: LEADS.length, duplicates: 3, outsideArea: 5, apiRequests: 3 },
      createdById: admin.id,
      startedAt: new Date(Date.now() - 21 * DAY),
      completedAt: new Date(Date.now() - 21 * DAY + 3600_000),
      isDemo: true,
    },
  });

  for (const [index, item] of LEADS.entries()) {
    const niche = getNiche(item.niche)!;
    const name = `${item.name} (demonstração)`;
    const email = `contato@${slugify(item.name)}.example`;
    const created = new Date(Date.now() - item.daysAgo * DAY - 3 * DAY);
    const score = computeLeadScore(
      {
        websiteStatus: item.website,
        websiteConfidence: item.website === "NO_WEBSITE_LIKELY" || item.website === "INCONCLUSIVE" ? "PROBABLE" : "CONFIRMED",
        businessStatus: "OPERATIONAL",
        hasPhone: false,
        phoneIsMobile: false,
        hasWhatsapp: false,
        hasEmail: true,
        hasSocialProfile: Boolean(item.instagram),
        rating: item.rating,
        reviewCount: item.reviews,
        nicheFit: niche.fit,
      },
      DEFAULT_AGENT_SETTINGS,
    );
    const facts = {
      name,
      category: niche.label,
      nicheLabel: niche.label,
      nichePlural: niche.plural,
      nicheNeed: niche.need,
      nicheBenefits: niche.benefits,
      suggestedSections: niche.suggestedSections,
      city: item.city,
      state: item.state,
      source: "GOOGLE_PLACES" as const,
      websiteStatus: item.website,
      websiteConfidence: "CONFIRMED" as const,
      websiteIssues: item.website === "WEBSITE_WITH_ISSUES" ? ["Não está adaptado para celular (sem meta viewport)."] : [],
      websiteSummary: null,
      hasInstagram: Boolean(item.instagram),
      hasFacebook: false,
      hasPhone: false,
      hasEmail: true,
      rating: item.rating,
      reviewCount: item.reviews,
      score: score.score,
      priority: score.priority,
      scoreSummary: score.summary,
    };
    const analysis = buildTemplateAnalysis(facts, {
      price: 500,
      packageName: pkg.name,
      deliveryDays: pkg.deliveryDays,
      features: pkg.features as string[],
      notIncluded: pkg.notIncluded as string[],
      senderName: "",
      senderCompany: "",
      portfolioUrl: "",
      signature: "",
      tone: "informal",
      maxChars: 600,
      includeOptOutHint: true,
      extraInstructions: "",
      variant: index % 2 === 0 ? { key: "A", label: "Direta", instructions: "" } : { key: "B", label: "Consultiva", instructions: "" },
    });

    const lead = await db.lead.create({
      data: {
        name,
        normalizedName: normalizeBusinessName(name),
        category: niche.label,
        nicheKey: niche.key,
        address: `Endereço de demonstração, ${item.city}`,
        city: item.city,
        cityNormalized: normalizeText(item.city),
        state: item.state,
        email,
        emailSource: "MANUAL",
        instagramUrl: item.instagram ? `https://www.instagram.com/${slugify(item.name).replace(/-/g, "")}.example/` : null,
        websiteStatus: item.website,
        websiteConfidence: item.website === "NO_WEBSITE_LIKELY" || item.website === "INCONCLUSIVE" ? "PROBABLE" : "CONFIRMED",
        websiteCheckedAt: created,
        websiteIssues: facts.websiteIssues,
        businessStatus: "OPERATIONAL",
        rating: item.rating,
        reviewCount: item.reviews,
        primarySource: "MANUAL",
        lastVerifiedAt: created,
        score: score.score,
        priority: score.priority,
        scoreBreakdown: { factors: score.factors, caps: score.caps, summary: score.summary, disqualified: score.disqualified } as never,
        scoredAt: created,
        analysis: { ...analysis, generatedBy: "template", generatedAt: created.toISOString(), variant: index % 2 === 0 ? "A" : "B", warnings: [] } as never,
        analysisAt: created,
        stage: item.stage,
        stageChangedAt: new Date(Date.now() - item.daysAgo * DAY),
        lossReason: item.stage === "LOST" ? "NO_NEED" : null,
        dealValue: item.won ?? null,
        wonAt: item.won ? new Date(Date.now() - 2 * DAY) : null,
        doNotContact: item.stage === "DO_NOT_CONTACT",
        doNotContactAt: item.stage === "DO_NOT_CONTACT" ? new Date(Date.now() - 9 * DAY) : null,
        doNotContactReason: item.stage === "DO_NOT_CONTACT" ? "Pediu para não receber mais mensagens." : null,
        isDemo: true,
        createdAt: created,
        campaignLeads: { create: { campaignId: campaign.id, isNew: true, status: "MESSAGE_DRAFTED" } },
        activities: { create: { type: "LEAD_CREATED", description: "Lead de demonstração criado.", createdAt: created } },
      },
    });

    const contacted = !["FOUND", "VERIFYING", "QUALIFIED", "MESSAGE_READY"].includes(item.stage);
    if (item.stage === "MESSAGE_READY") {
      await db.message.create({
        data: {
          leadId: lead.id,
          campaignId: campaign.id,
          channel: "EMAIL",
          direction: "OUTBOUND",
          status: "PENDING_APPROVAL",
          subject: analysis.emailSubject,
          body: analysis.emailBody,
          toAddress: email,
          variant: index % 2 === 0 ? "A" : "B",
          generatedBy: "template",
          warnings: [],
        },
      });
    }
    if (contacted) {
      const sentAt = new Date(Date.now() - item.daysAgo * DAY);
      const outbound = await db.message.create({
        data: {
          leadId: lead.id,
          campaignId: campaign.id,
          channel: "EMAIL",
          direction: "OUTBOUND",
          status: "SENT",
          sendMethod: "MANUAL",
          subject: analysis.emailSubject,
          body: analysis.emailBody,
          toAddress: email,
          variant: index % 2 === 0 ? "A" : "B",
          generatedBy: "template",
          approvedById: admin.id,
          approvedAt: sentAt,
          sentAt,
          createdAt: sentAt,
        },
      });
      await db.lead.update({ where: { id: lead.id }, data: { lastContactAt: sentAt } });
      if (item.reply) {
        const receivedAt = new Date(sentAt.getTime() + 5 * 3600_000);
        await db.message.create({
          data: {
            leadId: lead.id,
            campaignId: campaign.id,
            channel: "EMAIL",
            direction: "INBOUND",
            status: "RECEIVED",
            purpose: "REPLY",
            body: item.reply.text,
            fromAddress: email,
            receivedAt,
            inReplyToId: outbound.id,
            classification: item.reply.classification,
            classificationConfidence: 0.9,
            classifiedBy: "rules",
            createdAt: receivedAt,
          },
        });
        await db.lead.update({ where: { id: lead.id }, data: { lastReplyAt: receivedAt } });
      }
    }
    if (item.stage === "PROPOSAL_SENT" || item.stage === "WON") {
      await db.proposal.create({
        data: {
          leadId: lead.id,
          packageId: pkg.id,
          status: item.stage === "WON" ? "ACCEPTED" : "SENT",
          title: `Proposta de criação de site — ${name}`,
          objective: `Criar um site profissional para a ${name} com foco em ${niche.need}.`,
          structure: ["Página inicial com apresentação do negócio", ...niche.suggestedSections.map((s) => `Seção: ${s}`)],
          features: pkg.features as string[],
          notIncluded: pkg.notIncluded as string[],
          clientResponsibilities: pkg.clientResponsibilities as string[],
          timelineDays: pkg.deliveryDays,
          price: 500,
          paymentTerms: pkg.paymentTerms,
          supportTerms: pkg.supportTerms,
          validUntil: new Date(Date.now() + 10 * DAY),
          approvedById: admin.id,
          approvedAt: new Date(Date.now() - 5 * DAY),
          sentAt: new Date(Date.now() - 5 * DAY),
          sentVia: "manual",
          acceptedAt: item.stage === "WON" ? new Date(Date.now() - 2 * DAY) : null,
        },
      });
    }
    if (item.stage === "INTERESTED") {
      await db.followUpTask.create({ data: { leadId: lead.id, title: `Responder ${name}`, type: "REPLY", dueAt: new Date(), auto: true } });
    }
  }
  console.log(`✔ ${LEADS.length} leads de demonstração criados (marcados como demonstração).`);
}

main()
  .catch((error) => {
    console.error(`✖ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
