import type { Prisma, Proposal } from "@/generated/prisma/client";
import type { ProposalStatus } from "@/generated/prisma/enums";
import { formatBRL, formatDateLong, toNumber } from "@/lib/format";
import { customNiche, getNiche } from "@/data/niches";
import type { StoredAnalysis } from "@/lib/agent/lead-facts";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { sendEmail } from "@/server/integrations/email";
import { audit } from "@/server/security/audit";
import { recordActivity } from "@/server/services/activity";
import { changeLeadStage } from "@/server/services/leads";
import { evaluateMessagePolicy, oneClickUnsubscribeUrl, unsubscribeUrl } from "@/server/services/messages";
import { getDefaultPackage, getPackage, getSenderProfile } from "@/server/services/settings";
import { renderProposalPdf } from "@/server/pdf/proposal-pdf";

const VALIDITY_DAYS = 15;

export function proposalCode(number: number): string {
  return `#${String(number).padStart(4, "0")}`;
}

export async function createProposal(leadId: string, packageId: string | null, userId: string): Promise<Proposal> {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Lead não encontrado.");
  if (lead.doNotContact) throw new AppError("Este contato pediu para não receber mensagens.");
  const pkg = packageId ? await getPackage(packageId) : await getDefaultPackage();
  if (!pkg) throw new AppError("Cadastre um pacote de serviço em Configurações → Preços e serviços.");
  const niche = getNiche(lead.nicheKey) ?? customNiche(lead.category ?? "negócio local");
  const analysis = (lead.analysis ?? null) as StoredAnalysis | null;
  const profile = await getSenderProfile();

  const objective = `Criar um site profissional para a ${lead.name} com foco em ${niche.need}, reunindo as informações do negócio em um só lugar e facilitando o contato de novos clientes pelo WhatsApp.`;
  const structure = ["Página inicial com apresentação do negócio", ...niche.suggestedSections.map((s) => `Seção: ${s}`)];
  const proposal = await db.proposal.create({
    data: {
      leadId,
      packageId: pkg.id,
      title: `Proposta de criação de site — ${lead.name}`,
      objective: analysis?.identifiedNeed ? `${objective} ${analysis.identifiedNeed}` : objective,
      structure,
      features: pkg.features,
      notIncluded: pkg.notIncluded,
      clientResponsibilities: pkg.clientResponsibilities,
      timelineDays: pkg.deliveryDays,
      price: pkg.price,
      paymentTerms: pkg.paymentTerms,
      supportTerms: pkg.supportTerms,
      validUntil: new Date(Date.now() + VALIDITY_DAYS * 86400_000),
      followUpMessage: `Olá! Conforme conversamos, segue a proposta para o site da ${lead.name}: ${pkg.name}, por ${formatBRL(
        pkg.price,
      )}, com prazo estimado de ${pkg.deliveryDays} dias úteis após o envio do conteúdo. Fico à disposição para tirar dúvidas.${
        profile.name ? ` — ${profile.name}` : ""
      }`,
    },
  });
  await recordActivity({ leadId, type: "PROPOSAL_CREATED", description: `Proposta ${proposalCode(proposal.number)} criada (rascunho).`, actorId: userId });
  if (["INTERESTED", "CONTACTED", "AWAITING_REPLY"].includes(lead.stage)) {
    await changeLeadStage(leadId, "NEGOTIATION", { userId });
  }
  return proposal;
}

export interface ProposalEditInput {
  title: string;
  objective: string;
  structure: string[];
  features: string[];
  notIncluded: string[];
  clientResponsibilities: string[];
  timelineDays: number;
  price: number;
  paymentTerms: string;
  supportTerms: string;
  validUntil: Date;
  notes: string | null;
  followUpMessage: string | null;
}

export async function updateProposal(id: string, input: ProposalEditInput, userId: string): Promise<Proposal> {
  const proposal = await db.proposal.findUnique({ where: { id } });
  if (!proposal) throw new NotFoundError("Proposta não encontrada.");
  if (!["DRAFT", "APPROVED"].includes(proposal.status)) throw new AppError("Propostas enviadas não podem ser editadas. Crie uma nova versão.");
  const updated = await db.proposal.update({
    where: { id },
    // Qualquer edição exige nova aprovação.
    data: { ...input, status: "DRAFT", approvedAt: null, approvedById: null },
  });
  await audit({ userId, action: "proposal.edit", entityType: "Proposal", entityId: id });
  return updated;
}

export async function approveProposal(id: string, userId: string): Promise<void> {
  const proposal = await db.proposal.findUnique({ where: { id } });
  if (!proposal) throw new NotFoundError("Proposta não encontrada.");
  if (proposal.status !== "DRAFT") throw new AppError("Apenas rascunhos podem ser aprovados.");
  if (toNumber(proposal.price) <= 0) throw new AppError("Defina um preço válido antes de aprovar.");
  await db.proposal.update({ where: { id }, data: { status: "APPROVED", approvedById: userId, approvedAt: new Date() } });
  await recordActivity({ leadId: proposal.leadId, type: "PROPOSAL_APPROVED", description: `Proposta ${proposalCode(proposal.number)} aprovada para envio.`, actorId: userId });
  await audit({ userId, action: "proposal.approve", entityType: "Proposal", entityId: id, metadata: { price: toNumber(proposal.price) } });
}

async function markSent(proposal: Proposal, via: string, userId: string) {
  await db.proposal.update({ where: { id: proposal.id }, data: { status: "SENT", sentAt: new Date(), sentVia: via } });
  await db.lead.update({ where: { id: proposal.leadId }, data: { lastContactAt: new Date() } });
  await changeLeadStage(proposal.leadId, "PROPOSAL_SENT", { userId });
  await recordActivity({ leadId: proposal.leadId, type: "PROPOSAL_SENT", description: `Proposta ${proposalCode(proposal.number)} enviada (${via}).`, actorId: userId });
  await audit({ userId, action: "proposal.sent", entityType: "Proposal", entityId: proposal.id, metadata: { via } });
}

async function loadApproved(id: string): Promise<Proposal> {
  const proposal = await db.proposal.findUnique({ where: { id } });
  if (!proposal) throw new NotFoundError("Proposta não encontrada.");
  if (proposal.status !== "APPROVED") throw new AppError("A proposta precisa ser aprovada antes do envio.");
  return proposal;
}

/** O usuário enviou o PDF por conta própria (ex.: WhatsApp pessoal) e registra aqui. */
export async function markProposalSentManually(id: string, userId: string): Promise<void> {
  const proposal = await loadApproved(id);
  await markSent(proposal, "manual", userId);
}

export async function sendProposalByEmail(id: string, userId: string): Promise<void> {
  const proposal = await loadApproved(id);
  const lead = await db.lead.findUniqueOrThrow({ where: { id: proposal.leadId } });
  if (!lead.email) throw new AppError("O lead não tem e-mail cadastrado.");
  const body = proposal.followUpMessage ?? `Segue em anexo a proposta para o site da ${lead.name}.`;
  const draft = await db.message.create({
    data: {
      leadId: lead.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      status: "QUEUED",
      purpose: "PROPOSAL",
      subject: proposal.title,
      body,
      toAddress: lead.email,
      generatedBy: "user",
      approvedById: userId,
      approvedAt: new Date(),
      createdById: userId,
    },
  });
  const decision = await evaluateMessagePolicy(draft, "API");
  if (!decision.allowed) {
    await db.message.update({ where: { id: draft.id }, data: { status: "FAILED", error: decision.blockers.join(" ") } });
    throw new AppError(decision.blockers.join(" "));
  }
  const pdf = await renderProposalPdf(proposal.id);
  try {
    const { providerMessageId } = await sendEmail({
      to: lead.email,
      subject: proposal.title,
      text: `${body}\n\n—\nPara não receber mais mensagens, acesse ${unsubscribeUrl(lead.id)}.`,
      unsubscribeUrl: oneClickUnsubscribeUrl(lead.id),
      attachments: [{ filename: `proposta-${String(proposal.number).padStart(4, "0")}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    await db.message.update({ where: { id: draft.id }, data: { status: "SENT", sentAt: new Date(), sendMethod: "API", providerMessageId } });
  } catch (error) {
    await db.message.update({ where: { id: draft.id }, data: { status: "FAILED", failedAt: new Date(), error: (error as Error).message } });
    throw error;
  }
  await markSent(proposal, "e-mail", userId);
}

export async function setProposalOutcome(id: string, outcome: "ACCEPTED" | "REJECTED", userId: string): Promise<void> {
  const proposal = await db.proposal.findUnique({ where: { id } });
  if (!proposal) throw new NotFoundError("Proposta não encontrada.");
  if (!["SENT", "APPROVED", "EXPIRED"].includes(proposal.status)) throw new AppError("Registre o envio antes do resultado.");
  await db.proposal.update({
    where: { id },
    data: { status: outcome, ...(outcome === "ACCEPTED" ? { acceptedAt: new Date() } : { rejectedAt: new Date() }) },
  });
  await recordActivity({
    leadId: proposal.leadId,
    type: outcome === "ACCEPTED" ? "PROPOSAL_ACCEPTED" : "PROPOSAL_REJECTED",
    description: `Proposta ${proposalCode(proposal.number)} ${outcome === "ACCEPTED" ? "aceita pelo cliente" : "recusada"}.`,
    actorId: userId,
  });
  if (outcome === "ACCEPTED") {
    await changeLeadStage(proposal.leadId, "WON", { userId, dealValue: toNumber(proposal.price) });
  }
  await audit({ userId, action: `proposal.${outcome.toLowerCase()}`, entityType: "Proposal", entityId: id });
}

export async function listProposals(filter: { status?: ProposalStatus; page?: number }) {
  const where: Prisma.ProposalWhereInput = filter.status ? { status: filter.status } : {};
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = 20;
  const [total, items] = await db.$transaction([
    db.proposal.count({ where }),
    db.proposal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { lead: { select: { id: true, name: true, city: true, state: true, email: true, isDemo: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getProposal(id: string) {
  const proposal = await db.proposal.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, name: true, city: true, state: true, email: true, phoneE164: true, whatsappE164: true, doNotContact: true, isDemo: true } },
      approvedBy: { select: { name: true } },
      package: { select: { name: true } },
    },
  });
  if (!proposal) throw new NotFoundError("Proposta não encontrada.");
  return proposal;
}

export function proposalValiditySummary(p: Pick<Proposal, "validUntil">): string {
  return `Válida até ${formatDateLong(p.validUntil)}`;
}
