import type { Job, Prisma } from "@/generated/prisma/client";
import { getNiche } from "@/data/niches";
import { normalizeText } from "@/lib/text";
import { db } from "@/server/db";
import { IntegrationNotConfiguredError, errorMessage, IntegrationError } from "@/server/errors";
import { getSource } from "@/server/integrations/sources";
import { enqueueJob } from "@/server/jobs/queue";
import { pauseCampaign, readProgress, type CampaignProgress } from "@/server/services/campaigns";
import { logEvent } from "@/server/services/events";
import { upsertLeadFromRaw } from "@/server/services/leads";
import { QuotaExceededError } from "@/server/services/usage";

/**
 * Etapas 1–4 do fluxo: pesquisar empresas, coletar dados permitidos, deduplicar e
 * enfileirar a verificação de cada lead. O progresso (fonte, termo e cursor da página)
 * é salvo a cada página — se o worker cair, a pesquisa continua de onde parou.
 */

const MAX_PAGES_PER_TERM = 3; // Google Places entrega até 60 resultados por consulta

async function saveProgress(campaignId: string, progress: CampaignProgress) {
  await db.campaign.update({ where: { id: campaignId }, data: { progress: progress as unknown as Prisma.InputJsonValue } });
}

async function isRunning(campaignId: string): Promise<boolean> {
  const c = await db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
  return c?.status === "RUNNING";
}

export async function handleCampaignSearch(job: Job): Promise<Prisma.InputJsonValue> {
  const { campaignId } = job.payload as { campaignId: string };
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== "RUNNING") return { skipped: true };

  const progress = readProgress(campaign);
  const providers = campaign.providers as Array<"GOOGLE_PLACES" | "OSM">;
  const terms = campaign.searchTerms as string[];
  const niche = getNiche(campaign.nicheKey);
  const cityKey = normalizeText(campaign.city);
  const pagesByKey = new Map<string, number>();

  while (!progress.searchDone && progress.linked < campaign.targetCount) {
    const provider = providers[progress.providerIndex];
    if (!provider) {
      progress.searchDone = true;
      break;
    }
    const source = getSource(provider);
    const term = terms[progress.termIndex];
    const advanceProvider = () => {
      progress.providerIndex += 1;
      progress.termIndex = 0;
      progress.cursor = null;
    };
    if (!source || !term) {
      advanceProvider();
      continue;
    }
    if (!source.isConfigured()) {
      progress.skippedProviders.push(source.label);
      await logEvent({ level: "WARN", source: "campaign.search", message: `${source.label} não configurado — fonte ignorada.`, campaignId, jobId: job.id });
      advanceProvider();
      continue;
    }

    const pageKey = `${provider}:${progress.termIndex}`;
    const pagesDone = pagesByKey.get(pageKey) ?? 0;
    let page;
    try {
      page = await source.search({
        term,
        city: campaign.city,
        state: campaign.state,
        cursor: progress.cursor,
        limit: Math.min(20, campaign.targetCount - progress.linked),
        osmTags: provider === "OSM" ? niche?.osmTags : undefined,
      });
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        await saveProgress(campaignId, progress);
        await pauseCampaign(campaignId, null, error.message);
        return { paused: true, reason: error.message };
      }
      if (error instanceof IntegrationNotConfiguredError || (error instanceof IntegrationError && !error.retryable)) {
        progress.warnings.push(`${source.label}: ${errorMessage(error)}`);
        await logEvent({ level: "ERROR", source: "campaign.search", message: `${source.label}: ${errorMessage(error)}`, campaignId, jobId: job.id });
        advanceProvider();
        await saveProgress(campaignId, progress);
        continue;
      }
      await saveProgress(campaignId, progress);
      throw error; // falha temporária: a fila tenta de novo a partir do mesmo cursor
    }
    progress.apiRequests += page.requests;
    progress.found += page.items.length;

    for (const raw of page.items) {
      if (progress.linked >= campaign.targetCount) break;
      if (raw.city && normalizeText(raw.city) !== cityKey) {
        progress.outsideArea += 1;
        continue;
      }
      const result = await upsertLeadFromRaw(raw, {
        nicheKey: campaign.nicheKey,
        nicheLabel: campaign.nicheLabel,
        fallbackCity: campaign.city,
        fallbackState: campaign.state,
      });
      const link = await db.campaignLead.createMany({
        data: [{ campaignId, leadId: result.leadId, isNew: result.created }],
        skipDuplicates: true,
      });
      if (link.count === 0) {
        progress.duplicates += 1; // já veio de outra fonte/termo nesta campanha
        continue;
      }
      if (result.created) progress.created += 1;
      else progress.duplicates += 1;
      progress.linked += 1;
      await enqueueJob(
        "lead.process",
        { campaignId, leadId: result.leadId },
        { campaignId, leadId: result.leadId, idempotencyKey: `lead.process:${campaignId}:${result.leadId}`, maxAttempts: 3 },
      );
    }

    const nextPages = pagesDone + 1;
    pagesByKey.set(pageKey, nextPages);
    if (page.nextCursor && page.nextCursor !== "done" && nextPages < MAX_PAGES_PER_TERM) {
      progress.cursor = page.nextCursor;
    } else {
      progress.cursor = null;
      progress.termIndex += 1;
      if (progress.termIndex >= terms.length) advanceProvider();
    }
    await saveProgress(campaignId, progress);
    if (!(await isRunning(campaignId))) return { interrupted: true, linked: progress.linked };
  }

  progress.searchDone = true;
  await saveProgress(campaignId, progress);
  await logEvent({
    source: "campaign.search",
    message: `Pesquisa concluída: ${progress.found} resultado(s), ${progress.linked} lead(s) na campanha (${progress.created} novos, ${progress.duplicates} já existentes), ${progress.outsideArea} fora da cidade.`,
    campaignId,
    jobId: job.id,
  });
  return { linked: progress.linked, created: progress.created, duplicates: progress.duplicates };
}
