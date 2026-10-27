import type { Job, Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { pendingJobCount, rescheduleJob } from "@/server/jobs/queue";
import { computeCampaignReport, readProgress } from "@/server/services/campaigns";
import { logEvent } from "@/server/services/events";

/** Etapa 13: quando a pesquisa e todos os leads foram processados, gera o relatório. */
export async function handleCampaignFinalize(job: Job): Promise<Prisma.InputJsonValue | "rescheduled"> {
  const { campaignId } = job.payload as { campaignId: string };
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== "RUNNING") return { skipped: true };

  const progress = readProgress(campaign);
  const pending = await pendingJobCount(campaignId, ["campaign.search", "lead.process"]);
  if (!progress.searchDone || pending > 0) {
    await rescheduleJob(job, new Date(Date.now() + 20_000), `Aguardando ${pending} tarefa(s) da campanha.`);
    return "rescheduled";
  }

  const failed = await db.job.count({ where: { campaignId, status: "FAILED", type: "lead.process" } });
  const report = await computeCampaignReport(campaignId);
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      report: report as unknown as Prisma.InputJsonValue,
      lastError: failed ? `${failed} lead(s) não puderam ser processados — veja Tarefas e erros.` : null,
    },
  });
  await logEvent({
    source: "campaign",
    message: `Campanha concluída: ${report.leads} leads, ${report.messagesDrafted} mensagens preparadas para revisão.`,
    campaignId,
    jobId: job.id,
    level: failed ? "WARN" : "INFO",
  });
  return { leads: report.leads, drafted: report.messagesDrafted, failed };
}
