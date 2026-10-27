"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { retryJob } from "@/server/jobs/queue";
import { kickQueue } from "@/server/jobs/kick";
import { audit } from "@/server/security/audit";
import { testIntegration, type IntegrationKey } from "@/server/services/integrations";
import {
  approveProposal,
  createProposal,
  markProposalSentManually,
  sendProposalByEmail,
  setProposalOutcome,
  updateProposal,
} from "@/server/services/proposals";
import { saveAgentSettings, saveContactPolicy, saveSenderProfile } from "@/server/services/settings";
import { addSuppression } from "@/server/services/suppression";
import { createUser, resetPassword, updateUser } from "@/server/services/users";
import { agentSettingsSchema, contactPolicySchema, senderProfileSchema } from "@/lib/settings-schema";
import { parseBRL } from "@/lib/format";
import { bool, lines, optStr, runAction, str, type ActionState } from "./helpers";

// ───────────────────────────── Configurações ─────────────────────────────

export async function saveAgentSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings:write");
    const variants = ["A", "B"].map((key) => ({
      key,
      label: str(fd, `variant${key}Label`) || `Variante ${key}`,
      instructions: str(fd, `variant${key}Instructions`),
    }));
    const value = agentSettingsSchema.parse({
      tone: str(fd, "tone"),
      highPriorityMin: str(fd, "highPriorityMin"),
      mediumPriorityMin: str(fd, "mediumPriorityMin"),
      autoGenerateMessages: bool(fd, "autoGenerateMessages"),
      useAi: bool(fd, "useAi"),
      messageMaxChars: str(fd, "messageMaxChars"),
      includeOptOutHint: bool(fd, "includeOptOutHint"),
      extraInstructions: str(fd, "extraInstructions"),
      abTestEnabled: bool(fd, "abTestEnabled"),
      variants,
    });
    if (value.mediumPriorityMin >= value.highPriorityMin) throw new AppError("O mínimo da prioridade média deve ser menor que o da alta.");
    await saveAgentSettings(value, user.id);
    await audit({ userId: user.id, action: "settings.agent" });
    revalidatePath("/configuracoes/agente");
    return { ok: true, message: "Configurações do agente salvas." };
  });
}

export async function saveContactPolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings:write");
    const value = contactPolicySchema.parse({
      approvalMode: str(fd, "approvalMode") || "MANUAL",
      autoApprovalAcknowledged: bool(fd, "autoApprovalAcknowledged"),
      maxUnansweredMessages: str(fd, "maxUnansweredMessages"),
      minDaysBetweenContacts: str(fd, "minDaysBetweenContacts"),
      followUpAfterDays: str(fd, "followUpAfterDays"),
      dailyLimitWhatsapp: str(fd, "dailyLimitWhatsapp"),
      dailyLimitEmail: str(fd, "dailyLimitEmail"),
      sendWindowStartHour: str(fd, "sendWindowStartHour"),
      sendWindowEndHour: str(fd, "sendWindowEndHour"),
      sendWeekdays: fd.getAll("sendWeekdays").map(String),
      whatsappRequireOptIn: bool(fd, "whatsappRequireOptIn"),
      duplicateWindowDays: str(fd, "duplicateWindowDays"),
      maxLeadsPerCampaign: str(fd, "maxLeadsPerCampaign"),
      retentionDaysUncontacted: str(fd, "retentionDaysUncontacted"),
    });
    if (value.sendWindowEndHour <= value.sendWindowStartHour) throw new AppError("O fim da janela de envio deve ser depois do início.");
    if (value.approvalMode === "AUTO_EMAIL" && !value.autoApprovalAcknowledged) {
      throw new AppError("Para a aprovação automática de e-mails, confirme que leu e aceita as regras de envio.");
    }
    await saveContactPolicy(value, user.id);
    await audit({ userId: user.id, action: "settings.contact_policy", metadata: { approvalMode: value.approvalMode } });
    revalidatePath("/configuracoes/agente");
    return { ok: true, message: "Política de contato salva." };
  });
}

export async function saveSenderProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings:write");
    const value = senderProfileSchema.parse(
      Object.fromEntries(["name", "companyName", "email", "phone", "portfolioUrl", "cnpj", "city", "signature"].map((k) => [k, str(fd, k)])),
    );
    await saveSenderProfile(value, user.id);
    await audit({ userId: user.id, action: "settings.sender_profile" });
    revalidatePath("/configuracoes/agente");
    return { ok: true, message: "Perfil do remetente salvo." };
  });
}

export async function savePackageAction(packageId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings:write");
    const price = parseBRL(str(fd, "price"));
    if (price === null || price <= 0) return { ok: false, error: "Informe um preço válido.", fieldErrors: { price: ["Preço inválido."] } };
    const data = z
      .object({
        name: z.string().min(2, "Informe o nome."),
        description: z.string().min(5, "Descreva o pacote."),
        deliveryDays: z.coerce.number().int().min(1, "Mínimo 1 dia.").max(365),
        revisions: z.coerce.number().int().min(0).max(20),
        paymentTerms: z.string().min(3, "Informe as condições de pagamento."),
        supportTerms: z.string().min(3, "Informe as condições de suporte."),
      })
      .parse({
        name: str(fd, "name"),
        description: str(fd, "description"),
        deliveryDays: str(fd, "deliveryDays"),
        revisions: str(fd, "revisions") || "0",
        paymentTerms: str(fd, "paymentTerms"),
        supportTerms: str(fd, "supportTerms"),
      });
    const features = lines(fd, "features");
    if (features.length === 0) return { ok: false, error: "Liste ao menos uma funcionalidade incluída.", fieldErrors: { features: ["Obrigatório."] } };
    const payload = {
      ...data,
      price,
      features,
      notIncluded: lines(fd, "notIncluded"),
      clientResponsibilities: lines(fd, "clientResponsibilities"),
      active: bool(fd, "active"),
      isDefault: bool(fd, "isDefault"),
    };
    await db.$transaction(async (tx) => {
      if (payload.isDefault) await tx.servicePackage.updateMany({ data: { isDefault: false } });
      if (packageId) await tx.servicePackage.update({ where: { id: packageId }, data: payload });
      else await tx.servicePackage.create({ data: payload });
    });
    await audit({ userId: user.id, action: packageId ? "package.update" : "package.create", metadata: { price } });
    revalidatePath("/configuracoes/servicos");
    return { ok: true, message: "Pacote salvo." };
  });
}

// ───────────────────────────── Usuários ─────────────────────────────

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requirePermission("user:manage");
    const data = z
      .object({
        name: z.string().min(2, "Informe o nome."),
        email: z.string().email("E-mail inválido."),
        role: z.enum(Role),
        password: z.string().min(10, "Mínimo de 10 caracteres."),
      })
      .parse({ name: str(fd, "name"), email: str(fd, "email"), role: str(fd, "role"), password: str(fd, "password") });
    await createUser(data, actor.id);
    revalidatePath("/configuracoes/usuarios");
    return { ok: true, message: "Usuário criado." };
  });
}

export async function updateUserAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requirePermission("user:manage");
    await updateUser(userId, { role: z.enum(Role).parse(str(fd, "role")), active: bool(fd, "active") }, actor.id);
    const password = optStr(fd, "password");
    if (password) await resetPassword(userId, password, actor.id);
    revalidatePath("/configuracoes/usuarios");
    return { ok: true, message: password ? "Usuário atualizado e senha redefinida." : "Usuário atualizado." };
  });
}

// ───────────────────────────── Integrações e tarefas ─────────────────────────────

export async function testIntegrationAction(key: IntegrationKey): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("integration:manage");
    const result = await testIntegration(key, user.id);
    return result.ok ? { ok: true, message: result.message } : { ok: false, error: result.message };
  });
}

export async function retryJobAction(jobId: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("campaign:write");
    await retryJob(jobId);
    await audit({ userId: user.id, action: "job.retry", entityType: "Job", entityId: jobId });
    revalidatePath("/tarefas");
    kickQueue();
    return { ok: true, message: "Tarefa recolocada na fila." };
  });
}

// ───────────────────────────── Dados e LGPD ─────────────────────────────

export async function purgeDemoDataAction(): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings:write");
    const { count } = await db.lead.deleteMany({ where: { isDemo: true } });
    await db.campaign.deleteMany({ where: { isDemo: true } });
    await audit({ userId: user.id, action: "data.purge_demo", metadata: { leads: count } });
    revalidatePath("/", "layout");
    return { ok: true, message: `${count} lead(s) de demonstração removidos.` };
  });
}

export async function addSuppressionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:write");
    const value = str(fd, "value");
    if (!value) return { ok: false, error: "Informe um telefone ou e-mail.", fieldErrors: { value: ["Obrigatório."] } };
    const isEmail = value.includes("@");
    const added = await addSuppression(isEmail ? { email: value } : { phoneE164: value }, {
      reason: optStr(fd, "reason") ?? "Pedido de não contato registrado manualmente.",
      source: "MANUAL",
      userId: user.id,
    });
    if (added === 0) return { ok: false, error: isEmail ? "E-mail inválido." : "Telefone inválido (use DDD + número)." };
    // Bloqueia também leads já cadastrados com esse contato.
    const leads = await db.lead.findMany({
      where: isEmail ? { email: value.toLowerCase() } : { OR: [{ phoneE164: { endsWith: value.replace(/\D/g, "").slice(-8) } }] },
      select: { id: true },
    });
    for (const lead of leads) {
      await db.lead.update({ where: { id: lead.id }, data: { doNotContact: true, doNotContactAt: new Date(), doNotContactReason: "Lista de supressão", stage: "DO_NOT_CONTACT" } });
    }
    await audit({ userId: user.id, action: "suppression.add", metadata: { type: isEmail ? "EMAIL" : "PHONE", leads: leads.length } });
    revalidatePath("/configuracoes/dados");
    return { ok: true, message: `Contato adicionado à lista de supressão${leads.length ? ` (${leads.length} lead(s) bloqueado(s))` : ""}.` };
  });
}

// ───────────────────────────── Propostas ─────────────────────────────

export async function createProposalAction(leadId: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("proposal:write");
    const proposal = await createProposal(leadId, null, user.id);
    revalidatePath(`/leads/${leadId}`);
    return { ok: true, message: "Proposta criada como rascunho.", data: { id: proposal.id } };
  });
}

export async function saveProposalAction(proposalId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("proposal:write");
    const price = parseBRL(str(fd, "price"));
    if (!price || price <= 0) return { ok: false, error: "Informe um preço válido.", fieldErrors: { price: ["Preço inválido."] } };
    const validUntil = new Date(`${str(fd, "validUntil")}T23:59:00-03:00`);
    if (Number.isNaN(validUntil.getTime())) return { ok: false, error: "Data de validade inválida.", fieldErrors: { validUntil: ["Data inválida."] } };
    await updateProposal(
      proposalId,
      {
        title: z.string().min(3, "Informe o título.").parse(str(fd, "title")),
        objective: z.string().min(10, "Descreva o objetivo.").parse(str(fd, "objective")),
        structure: lines(fd, "structure"),
        features: lines(fd, "features"),
        notIncluded: lines(fd, "notIncluded"),
        clientResponsibilities: lines(fd, "clientResponsibilities"),
        timelineDays: z.coerce.number().int().min(1).max(365).parse(str(fd, "timelineDays")),
        price,
        paymentTerms: str(fd, "paymentTerms"),
        supportTerms: str(fd, "supportTerms"),
        validUntil,
        notes: optStr(fd, "notes"),
        followUpMessage: optStr(fd, "followUpMessage"),
      },
      user.id,
    );
    revalidatePath(`/propostas/${proposalId}`);
    return { ok: true, message: "Proposta salva como rascunho. Aprove para liberar o envio." };
  });
}

export async function proposalCommandAction(proposalId: string, command: "approve" | "mark_sent" | "send_email" | "accepted" | "rejected"): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission(command === "approve" ? "proposal:approve" : "proposal:write");
    const messages = {
      approve: "Proposta aprovada para envio.",
      mark_sent: "Envio registrado.",
      send_email: "Proposta enviada por e-mail com o PDF anexo.",
      accepted: "Venda registrada como fechada.",
      rejected: "Proposta marcada como recusada.",
    };
    if (command === "approve") await approveProposal(proposalId, user.id);
    else if (command === "mark_sent") await markProposalSentManually(proposalId, user.id);
    else if (command === "send_email") await sendProposalByEmail(proposalId, user.id);
    else await setProposalOutcome(proposalId, command === "accepted" ? "ACCEPTED" : "REJECTED", user.id);
    revalidatePath(`/propostas/${proposalId}`);
    revalidatePath("/propostas");
    return { ok: true, message: messages[command] };
  });
}
