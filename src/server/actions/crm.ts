"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LeadStage, LossReason, TaskType } from "@/generated/prisma/enums";
import { requirePermission } from "@/server/auth/session";
import { draftInitialMessage, generateLeadAnalysis, scoreLead } from "@/server/agent/lead-agent";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { enqueueJob } from "@/server/jobs/queue";
import { parseBRL } from "@/lib/format";
import {
  addNote,
  changeLeadStage,
  createTask,
  eraseLead,
  markDoNotContact,
  recordWhatsappOptIn,
  setTaskStatus,
  updateLead,
} from "@/server/services/leads";
import { optStr, runAction, str, type ActionState } from "./helpers";

const leadPath = (id: string) => `/leads/${id}`;

export async function updateLeadAction(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:write");
    const input = z
      .object({
        name: z.string().min(2, "Informe o nome."),
        state: z.string().length(2, "UF inválida."),
        city: z.string().min(2, "Informe a cidade."),
        email: z.union([z.literal(""), z.string().email("E-mail inválido.")]),
      })
      .parse({ name: str(fd, "name"), state: str(fd, "state"), city: str(fd, "city"), email: str(fd, "email") });
    await updateLead(
      leadId,
      {
        ...input,
        email: input.email || null,
        category: optStr(fd, "category"),
        nicheKey: optStr(fd, "nicheKey"),
        address: optStr(fd, "address"),
        neighborhood: optStr(fd, "neighborhood"),
        phone: optStr(fd, "phone"),
        whatsapp: optStr(fd, "whatsapp"),
        instagramUrl: optStr(fd, "instagramUrl"),
        facebookUrl: optStr(fd, "facebookUrl"),
        websiteUrl: optStr(fd, "websiteUrl"),
      },
      user.id,
    );
    revalidatePath(leadPath(leadId));
    return { ok: true, message: "Dados do lead atualizados." };
  });
}

export async function changeStageAction(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:write");
    const stage = z.enum(LeadStage).parse(str(fd, "stage"));
    if (stage === "DO_NOT_CONTACT") {
      await markDoNotContact(leadId, { reason: optStr(fd, "note") ?? "Marcado manualmente.", source: "MANUAL", userId: user.id });
    } else {
      const lossReason = optStr(fd, "lossReason");
      const dealValue = optStr(fd, "dealValue");
      await changeLeadStage(leadId, stage, {
        userId: user.id,
        actorType: "USER",
        lossReason: lossReason ? z.enum(LossReason).parse(lossReason) : null,
        lossNote: optStr(fd, "lossNote"),
        dealValue: dealValue ? parseBRL(dealValue) : null,
      });
    }
    revalidatePath(leadPath(leadId));
    revalidatePath("/funil");
    return { ok: true, message: "Etapa atualizada." };
  });
}

/** Usado pelo quadro do funil (arrastar ou menu "mover para"). */
export async function moveStageAction(leadId: string, stage: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:write");
    const parsed = z.enum(LeadStage).parse(stage);
    if (["LOST", "WON", "DO_NOT_CONTACT"].includes(parsed)) {
      throw new AppError("Abra a ficha do lead para registrar o motivo ou o valor desta etapa.");
    }
    await changeLeadStage(leadId, parsed, { userId: user.id, actorType: "USER" });
    revalidatePath("/funil");
    return { ok: true, message: "Lead movido." };
  });
}

export async function addNoteAction(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:write");
    const body = z.string().min(1, "Escreva a observação.").max(5000).parse(str(fd, "body"));
    await addNote(leadId, body, user.id);
    revalidatePath(leadPath(leadId));
    return { ok: true, message: "Observação adicionada." };
  });
}

export async function createTaskAction(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:write");
    const data = z
      .object({
        title: z.string().min(2, "Descreva o próximo passo."),
        type: z.enum(TaskType),
        dueAt: z.string().min(1, "Informe a data."),
      })
      .parse({ title: str(fd, "title"), type: str(fd, "type") || "FOLLOW_UP", dueAt: str(fd, "dueAt") });
    const due = new Date(`${data.dueAt}T09:00:00-03:00`);
    if (Number.isNaN(due.getTime())) throw new AppError("Data inválida.");
    await createTask(leadId, { title: data.title, type: data.type, dueAt: due }, user.id);
    revalidatePath(leadPath(leadId));
    return { ok: true, message: "Próximo passo agendado." };
  });
}

export async function setTaskStatusAction(taskId: string, status: "DONE" | "CANCELLED"): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:write");
    const task = await setTaskStatus(taskId, status, user.id);
    revalidatePath(leadPath(task.leadId));
    revalidatePath("/funil");
    return { ok: true, message: status === "DONE" ? "Tarefa concluída." : "Tarefa cancelada." };
  });
}

export async function reverifyLeadAction(leadId: string): Promise<ActionState> {
  return runAction(async () => {
    await requirePermission("lead:write");
    await enqueueJob("lead.process", { leadId, force: true }, { leadId, idempotencyKey: `lead.reverify:${leadId}:${Math.floor(Date.now() / 60000)}`, priority: 3 });
    return { ok: true, message: "Verificação agendada. O resultado aparece em instantes (o worker precisa estar ativo)." };
  });
}

export async function rescoreLeadAction(leadId: string): Promise<ActionState> {
  return runAction(async () => {
    await requirePermission("lead:write");
    const result = await scoreLead(leadId);
    revalidatePath(leadPath(leadId));
    return { ok: true, message: `Pontuação recalculada: ${result.score}/100.` };
  });
}

export async function regenerateAnalysisAction(leadId: string): Promise<ActionState> {
  return runAction(async () => {
    await requirePermission("message:write");
    const analysis = await generateLeadAnalysis(leadId);
    revalidatePath(leadPath(leadId));
    return {
      ok: true,
      message: analysis.aiError ? `IA indisponível (${analysis.aiError}); análise gerada pelo modelo padrão.` : "Análise atualizada.",
    };
  });
}

export async function draftMessageAction(leadId: string, channel: "WHATSAPP" | "EMAIL"): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("message:write");
    await draftInitialMessage(leadId, { channel, userId: user.id, regenerate: false });
    revalidatePath(leadPath(leadId));
    revalidatePath("/mensagens");
    return { ok: true, message: "Mensagem preparada e enviada para a fila de revisão." };
  });
}

export async function doNotContactAction(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:write");
    await markDoNotContact(leadId, { reason: optStr(fd, "reason") ?? "Solicitado pelo contato.", source: "MANUAL", userId: user.id });
    revalidatePath(leadPath(leadId));
    return { ok: true, message: "Contato bloqueado para novas mensagens." };
  });
}

export async function optInAction(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:write");
    const note = z.string().min(5, "Descreva como o consentimento foi obtido.").parse(str(fd, "note"));
    await recordWhatsappOptIn(leadId, note, user.id);
    revalidatePath(leadPath(leadId));
    return { ok: true, message: "Consentimento registrado." };
  });
}

export async function eraseLeadAction(leadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("lead:delete");
    if (str(fd, "confirm") !== "EXCLUIR") throw new AppError("Digite EXCLUIR para confirmar.");
    await eraseLead(leadId, user.id, optStr(fd, "reason") ?? "Solicitação do titular");
    revalidatePath("/leads");
    return { ok: true, message: "Dados excluídos. O contato permanece bloqueado para novas abordagens." };
  });
}

export async function bulkProcessLeadsAction(ids: string[]): Promise<ActionState> {
  return runAction(async () => {
    await requirePermission("lead:write");
    const leads = await db.lead.findMany({ where: { id: { in: ids.slice(0, 100) } }, select: { id: true } });
    for (const lead of leads) {
      await enqueueJob("lead.process", { leadId: lead.id }, { leadId: lead.id, idempotencyKey: `lead.process:manual:${lead.id}:${Math.floor(Date.now() / 60000)}` });
    }
    return { ok: true, message: `${leads.length} lead(s) enviados para verificação e qualificação.` };
  });
}
