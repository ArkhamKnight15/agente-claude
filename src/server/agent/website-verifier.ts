import type { Prisma } from "@/generated/prisma/client";
import {
  assessWebsiteQuality,
  decideWebsiteStatus,
  extractSignals,
  searchCandidateScore,
  type CandidateEvaluation,
  type DecisionInput,
  type EvidenceItem,
  type SearchRun,
  type WebsiteDecision,
} from "@/lib/agent/website-analysis";
import { normalizeBrazilPhone } from "@/lib/phone";
import { tokenCoverage } from "@/lib/text";
import { classifyUrl, domainNameMatch, instagramHandle, parseUrl } from "@/lib/url";
import { WEBSITE_STATUS_LABELS } from "@/data/labels";
import { db } from "@/server/db";
import { errorMessage, NotFoundError } from "@/server/errors";
import { fetchPublicPage } from "@/server/integrations/http";
import { getWebSearchProvider, webSearch } from "@/server/integrations/web-search";
import { QuotaExceededError } from "@/server/services/usage";
import { recordActivity } from "@/server/services/activity";
import { isRootAllowed } from "./robots";

/**
 * Verifica se a empresa possui site próprio, com evidências registradas.
 * Nunca conclui "sem site" a partir de uma única consulta.
 */

interface Enrichment {
  email?: string;
  whatsappE164?: string;
  instagramUrl?: string;
  facebookUrl?: string;
}

export interface VerificationResult {
  decision: WebsiteDecision;
  evidence: EvidenceItem[];
  enrichment: Enrichment;
  searchProvider: string | null;
  queriesRun: number;
}

async function evaluateCandidate(
  url: string,
  origin: "listing" | "search",
  business: { name: string; city: string; phoneE164: string | null },
  evidence: EvidenceItem[],
): Promise<CandidateEvaluation> {
  const parsed = parseUrl(url)!;
  const domain = classifyUrl(url)?.domain ?? parsed.hostname;
  const candidate: CandidateEvaluation = {
    url: parsed.origin,
    origin,
    domainMatch: domainNameMatch(business.name, domain),
    signals: null,
    quality: null,
  };

  if (!(await isRootAllowed(parsed.origin))) {
    evidence.push({ kind: "fetch", url: parsed.origin, message: "robots.txt não permite análise automatizada; conteúdo não foi lido." });
    candidate.fetchError = "O site não permite análise automatizada (robots.txt).";
    return candidate;
  }

  const page = await fetchPublicPage(origin === "listing" ? url : parsed.origin);
  if (page.errorCode && page.errorCode !== "NOT_HTML") {
    candidate.fetchError = page.errorMessage;
    candidate.fetchErrorCode = page.errorCode;
    evidence.push({ kind: "fetch_error", url: page.requestedUrl, message: page.errorMessage ?? "Falha ao acessar o site." });
    return candidate;
  }
  const signals = extractSignals(page, business);
  candidate.signals = signals;
  candidate.quality = assessWebsiteQuality(signals);
  evidence.push({
    kind: "fetch",
    url: page.finalUrl,
    message: `HTTP ${page.status ?? "—"} em ${(page.responseMs / 1000).toFixed(1)} s; ${signals.https ? "HTTPS" : "sem HTTPS"}; ${
      signals.hasViewport ? "adaptado a celular" : "sem adaptação a celular"
    }${signals.title ? `; título “${signals.title.slice(0, 80)}”` : ""}${
      origin === "search"
        ? `; corresponde à empresa: ${signals.mentionsPhone ? "telefone encontrado na página" : `nome ${Math.round(signals.nameMatch * 100)}%`}`
        : ""
    }.`,
  });
  return candidate;
}

export async function verifyLeadWebsite(leadId: string): Promise<VerificationResult> {
  const started = Date.now();
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { sources: true } });
  if (!lead) throw new NotFoundError("Lead não encontrado.");

  const evidence: EvidenceItem[] = [];
  const business = { name: lead.name, city: lead.city, phoneE164: lead.phoneE164 };
  const enrichment: Enrichment = {};

  // 1) O que as fontes informam.
  const listingHasWebsiteField = lead.sources.some((s) => (s.data as { hasWebsiteField?: boolean } | null)?.hasWebsiteField);
  for (const source of lead.sources) {
    const data = (source.data ?? {}) as { website?: string | null; hasWebsiteField?: boolean };
    const label = source.provider === "GOOGLE_PLACES" ? "Perfil no Google" : source.provider === "OSM" ? "OpenStreetMap" : source.provider;
    evidence.push({
      kind: "listing",
      source: source.provider,
      url: source.url ?? undefined,
      message: data.website
        ? `${label} informa o link: ${data.website}`
        : `${label} não informa site${data.hasWebsiteField ? "" : " (fonte colaborativa — ausência é um sinal fraco)"}.`,
    });
  }
  for (const [label, url] of [
    ["Instagram", lead.instagramUrl],
    ["Facebook", lead.facebookUrl],
  ] as const) {
    if (url) evidence.push({ kind: "listing_profile", url, message: `Perfil no ${label} encontrado — rede social não é considerada site próprio.` });
  }

  const listingClass = lead.websiteUrl ? classifyUrl(lead.websiteUrl) : null;
  const listingWebsiteKind: DecisionInput["listingWebsiteKind"] = !listingClass
    ? "none"
    : listingClass.kind === "own_domain"
      ? "own_domain"
      : listingClass.kind === "free_builder"
        ? "free_builder"
        : "profile";
  if (listingClass && listingClass.kind === "free_builder") {
    evidence.push({ kind: "listing", url: lead.websiteUrl!, message: `Página em ${listingClass.label}: sem domínio próprio.` });
  }

  const candidates: CandidateEvaluation[] = [];
  if (lead.websiteUrl && listingWebsiteKind === "own_domain") {
    candidates.push(await evaluateCandidate(lead.websiteUrl, "listing", business, evidence));
  }

  // 2) Busca web (pelo menos duas consultas para confirmar ausência).
  const provider = getWebSearchProvider();
  const searchRuns: SearchRun[] = [];
  const listingReachable = candidates.some((c) => c.origin === "listing" && c.signals?.reachable);
  if (!provider) {
    evidence.push({ kind: "search_unavailable", message: "Busca web não configurada — a ausência de site não pôde ser confirmada por busca." });
  } else if (!listingReachable) {
    const phone = normalizeBrazilPhone(lead.phoneE164);
    const queries = [`"${lead.name}" ${lead.city}`, `${lead.name} ${lead.city} ${lead.state} site oficial`];
    const seenDomains = new Set<string>();
    const searchCandidates: Array<{ url: string; score: number }> = [];

    for (const query of queries) {
      try {
        const { results } = await webSearch(query);
        let profiles = 0;
        let owned = 0;
        for (const result of results) {
          const cls = classifyUrl(result.url);
          if (!cls) continue;
          if (cls.kind === "own_domain") {
            const score = searchCandidateScore(lead.name, result.url, result.title);
            if (score >= 0.5 && !seenDomains.has(cls.domain)) {
              seenDomains.add(cls.domain);
              searchCandidates.push({ url: result.url, score });
              owned++;
            }
          } else {
            profiles++;
            if (cls.label === "Instagram" && !lead.instagramUrl && !enrichment.instagramUrl) {
              const handle = instagramHandle(result.url);
              if (handle && tokenCoverage(lead.name, `${handle} ${result.title}`) >= 0.6) enrichment.instagramUrl = `https://www.instagram.com/${handle}/`;
            }
            if (cls.label === "Facebook" && !lead.facebookUrl && !enrichment.facebookUrl && tokenCoverage(lead.name, result.title) >= 0.6) {
              enrichment.facebookUrl = result.url;
            }
          }
        }
        searchRuns.push({ query, ok: true, resultCount: results.length });
        evidence.push({
          kind: "search",
          query,
          source: provider.label,
          message: `${results.length} resultado(s): ${owned} possível(is) domínio(s) próprio(s), ${profiles} perfil(is)/diretório(s).`,
        });
      } catch (error) {
        searchRuns.push({ query, ok: false, resultCount: 0, error: errorMessage(error) });
        evidence.push({ kind: "search_error", query, message: `Falha na busca: ${errorMessage(error)}` });
        if (error instanceof QuotaExceededError) break;
      }
    }
    if (phone && searchCandidates.length === 0 && searchRuns.some((r) => r.ok)) {
      // Terceira consulta pelo telefone: encontra sites com nome comercial diferente.
      const query = `"${phone.national}"`;
      try {
        const { results } = await webSearch(query);
        for (const result of results) {
          const cls = classifyUrl(result.url);
          if (cls?.kind === "own_domain" && !seenDomains.has(cls.domain)) {
            seenDomains.add(cls.domain);
            searchCandidates.push({ url: result.url, score: 0.5 });
          }
        }
        searchRuns.push({ query, ok: true, resultCount: results.length });
        evidence.push({ kind: "search", query, source: provider.label, message: `${results.length} resultado(s) para o telefone.` });
      } catch (error) {
        searchRuns.push({ query, ok: false, resultCount: 0, error: errorMessage(error) });
      }
    }

    for (const sc of searchCandidates.sort((a, b) => b.score - a.score).slice(0, 3)) {
      evidence.push({ kind: "search_result", url: sc.url, message: `Possível site próprio (semelhança ${Math.round(sc.score * 100)}%) — verificando.` });
      candidates.push(await evaluateCandidate(sc.url, "search", business, evidence));
    }
  }

  // 3) Decisão.
  const decision = decideWebsiteStatus({
    listingHasWebsiteField,
    listingWebsiteKind,
    searchConfigured: Boolean(provider),
    searchRuns,
    candidates,
  });
  evidence.push({ kind: "decision", message: `${WEBSITE_STATUS_LABELS[decision.status].label}: ${decision.summary}` });

  // 4) Contatos publicados no próprio site da empresa (fonte legítima).
  const owned = candidates.find((c) => c.url === decision.websiteUrl && c.signals);
  if (owned?.signals) {
    const domain = classifyUrl(owned.url)?.domain;
    const email = owned.signals.emails.find((e) => domain && e.endsWith(`@${domain}`)) ?? owned.signals.emails[0];
    if (email && !lead.email) enrichment.email = email;
    if (owned.signals.whatsappNumbers[0] && !lead.whatsappE164) enrichment.whatsappE164 = owned.signals.whatsappNumbers[0];
    if (owned.signals.instagramUrls[0] && !lead.instagramUrl) enrichment.instagramUrl ??= owned.signals.instagramUrls[0];
    if (owned.signals.facebookUrls[0] && !lead.facebookUrl) enrichment.facebookUrl ??= owned.signals.facebookUrls[0];
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.websiteCheck.create({
      data: {
        leadId,
        status: decision.status,
        confidence: decision.confidence,
        websiteUrl: decision.websiteUrl,
        summary: decision.summary,
        evidence: evidence as unknown as Prisma.InputJsonValue,
        issues: decision.issues,
        searchProvider: provider?.label ?? null,
        queriesRun: searchRuns.length,
        durationMs: Date.now() - started,
      },
    });
    await tx.lead.update({
      where: { id: leadId },
      data: {
        websiteStatus: decision.status,
        websiteConfidence: decision.confidence,
        websiteCheckedAt: now,
        websiteIssues: decision.issues,
        ...(decision.websiteUrl && !lead.websiteUrl ? { websiteUrl: decision.websiteUrl } : {}),
        ...(enrichment.email ? { email: enrichment.email, emailSource: "WEBSITE" } : {}),
        ...(enrichment.whatsappE164 ? { whatsappE164: enrichment.whatsappE164, whatsappSource: "WEBSITE" } : {}),
        ...(enrichment.instagramUrl ? { instagramUrl: enrichment.instagramUrl } : {}),
        ...(enrichment.facebookUrl ? { facebookUrl: enrichment.facebookUrl } : {}),
      },
    });
    await recordActivity(
      {
        leadId,
        type: "WEBSITE_CHECKED",
        description: `Verificação de site: ${WEBSITE_STATUS_LABELS[decision.status].label} (${decision.confidence === "CONFIRMED" ? "confirmado" : decision.confidence === "PROBABLE" ? "provável" : "não verificado"}).`,
        actorType: "AGENT",
      },
      tx,
    );
  });

  return { decision, evidence, enrichment, searchProvider: provider?.label ?? null, queriesRun: searchRuns.length };
}
