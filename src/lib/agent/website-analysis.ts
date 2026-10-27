import type { VerificationConfidence, WebsiteStatus } from "@/generated/prisma/enums";
import { normalizeBrazilPhone, onlyDigits } from "@/lib/phone";
import { normalizeText, tokenCoverage } from "@/lib/text";
import { classifyUrl, domainNameMatch } from "@/lib/url";

/**
 * Regras puras de verificação de presença digital. A coleta (busca + download da página)
 * acontece em src/server/agent/website-verifier.ts; aqui ficam apenas as decisões, para
 * que sejam testáveis e explicáveis.
 */

export type EvidenceKind =
  | "listing"
  | "listing_profile"
  | "search"
  | "search_result"
  | "search_unavailable"
  | "search_error"
  | "fetch"
  | "fetch_error"
  | "decision";

export interface EvidenceItem {
  kind: EvidenceKind;
  message: string;
  url?: string;
  query?: string;
  source?: string;
}

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  html: string | null;
  responseMs: number;
  errorCode?: "TIMEOUT" | "DNS" | "TLS" | "CONNECTION" | "TOO_LARGE" | "BLOCKED" | "NOT_HTML";
  errorMessage?: string;
}

export interface BusinessRef {
  name: string;
  city: string;
  phoneE164?: string | null;
}

export interface PageSignals {
  reachable: boolean;
  status: number | null;
  https: boolean;
  title: string | null;
  description: string | null;
  hasViewport: boolean;
  copyrightYear: number | null;
  generator: string | null;
  textLength: number;
  parked: boolean;
  underConstruction: boolean;
  usesObsoleteTech: boolean;
  nameMatch: number;
  mentionsPhone: boolean;
  mentionsCity: boolean;
  emails: string[];
  whatsappNumbers: string[];
  instagramUrls: string[];
  facebookUrls: string[];
  responseMs: number;
}

const PARKED_PATTERNS = [
  /domain (is )?for sale/i,
  /dom[ií]nio (est[aá] )?[àa] venda/i,
  /comprar? (este|esse) dom[ií]nio/i,
  /this domain (may be|is) for sale/i,
  /parked (free|domain)/i,
  /hugedomains|sedoparking|dan\.com|afternic|bodis\.com/i,
  /account (has been )?suspended|conta suspensa/i,
  /apache2? (ubuntu|debian)? ?default page|welcome to nginx|it works!/i,
  /p[aá]gina padr[aã]o (da hospedagem|do servidor)/i,
  /index of \//i,
];

const CONSTRUCTION_PATTERNS = [
  /em constru[cç][aã]o/i,
  /under construction/i,
  /coming soon/i,
  /site em manuten[cç][aã]o/i,
  /em breve (nosso|um novo) site/i,
];

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`,
    "i",
  );
  const match = html.match(re);
  const value = match?.[1] ?? match?.[2];
  return value ? decodeEntities(value).trim() : null;
}

export function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function extractSignals(page: FetchedPage, business: BusinessRef): PageSignals {
  const html = page.html ?? "";
  const text = html ? visibleText(html) : "";
  const textDigits = onlyDigits(text + " " + html.slice(0, 200_000));
  const https = page.finalUrl.startsWith("https://");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  const years = [...text.matchAll(/(?:©|&copy;|copyright|todos os direitos reservados)[^0-9]{0,40}((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)]
    .flatMap((m) => [m[1], m[2]].filter(Boolean).map(Number));
  const copyrightYear = years.length ? Math.max(...years) : null;

  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1]));
  const emails = unique(
    [
      ...hrefs.filter((h) => h.toLowerCase().startsWith("mailto:")).map((h) => h.slice(7).split("?")[0]),
      ...(text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []),
    ]
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) && !/\.(png|jpg|jpeg|gif|webp|svg)$/.test(e)),
  ).slice(0, 5);

  const whatsappNumbers = unique(
    hrefs
      .map((h) => h.match(/(?:wa\.me\/|whatsapp\.com\/send\?phone=|api\.whatsapp\.com\/send\?phone=)(\+?\d{10,13})/i)?.[1])
      .filter((n): n is string => Boolean(n))
      .map((n) => normalizeBrazilPhone(n)?.e164)
      .filter((n): n is string => Boolean(n)),
  );

  const socials = hrefs.map((h) => classifyUrl(h)).filter(Boolean);
  const instagramUrls = unique(
    hrefs.filter((h, i) => socials[i]?.label === "Instagram" && /instagram\.com\/[^/?#]+/i.test(h)),
  ).slice(0, 3);
  const facebookUrls = unique(
    hrefs.filter((h, i) => socials[i]?.label === "Facebook" && /facebook\.com\/[^/?#]+/i.test(h)),
  ).slice(0, 3);

  const phoneDigits = business.phoneE164 ? onlyDigits(business.phoneE164).slice(2) : null;
  const sample = text.slice(0, 20_000);

  return {
    reachable: page.status !== null && page.status < 400 && !page.errorCode,
    status: page.status,
    https,
    title: title ? decodeEntities(title).replace(/\s+/g, " ").trim() || null : null,
    description: metaContent(html, "description") ?? metaContent(html, "og:description"),
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    copyrightYear,
    generator: metaContent(html, "generator"),
    textLength: text.length,
    parked: PARKED_PATTERNS.some((re) => re.test(sample)),
    underConstruction: CONSTRUCTION_PATTERNS.some((re) => re.test(sample)) && text.length < 1500,
    usesObsoleteTech: /<frameset|\.swf["'?]|<applet/i.test(html),
    nameMatch: Math.max(
      tokenCoverage(business.name, sample.slice(0, 5000)),
      tokenCoverage(business.name, title ?? ""),
    ),
    mentionsPhone: phoneDigits ? textDigits.includes(phoneDigits) : false,
    mentionsCity: normalizeText(sample).includes(normalizeText(business.city)),
    emails,
    whatsappNumbers,
    instagramUrls,
    facebookUrls,
    responseMs: page.responseMs,
  };
}

export interface QualityAssessment {
  professional: boolean;
  issues: string[];
  critical: boolean;
}

export function assessWebsiteQuality(signals: PageSignals, now = new Date()): QualityAssessment {
  const issues: string[] = [];
  let critical = false;
  const flag = (message: string, isCritical = false) => {
    issues.push(message);
    if (isCritical) critical = true;
  };

  if (!signals.reachable) flag(`O site não respondeu corretamente${signals.status ? ` (HTTP ${signals.status})` : ""}.`, true);
  if (signals.parked) flag("A página parece estacionada, suspensa ou é uma página padrão de hospedagem.", true);
  if (signals.underConstruction) flag("O site está marcado como em construção.", true);
  if (signals.reachable && !signals.hasViewport) flag("Não está adaptado para celular (sem meta viewport).", true);
  if (signals.usesObsoleteTech) flag("Usa tecnologia obsoleta (frames/Flash).", true);
  if (!signals.https) flag("Não usa HTTPS — navegadores exibem o aviso “Não seguro”.");
  if (signals.copyrightYear && signals.copyrightYear <= now.getFullYear() - 3) {
    flag(`O rodapé indica atualização em ${signals.copyrightYear}.`);
  }
  if (signals.reachable && signals.textLength < 300) flag("Pouco conteúdo na página inicial.");
  if (signals.reachable && !signals.title) flag("Página sem título (prejudica o Google).");
  if (signals.responseMs > 5000) flag(`Carregamento lento (${(signals.responseMs / 1000).toFixed(1)} s).`);

  return { professional: !critical && issues.length <= 1, issues, critical };
}

export interface CandidateEvaluation {
  url: string;
  origin: "listing" | "search";
  domainMatch: number;
  signals: PageSignals | null;
  quality: QualityAssessment | null;
  fetchError?: string;
  fetchErrorCode?: FetchedPage["errorCode"];
}

/** O site encontrado pertence mesmo à empresa? */
export function candidateBelongsToBusiness(candidate: CandidateEvaluation): boolean {
  if (candidate.origin === "listing") return true; // link informado pela própria empresa no perfil
  const s = candidate.signals;
  if (!s) return candidate.domainMatch >= 0.85;
  return s.mentionsPhone || (s.nameMatch >= 0.6 && (s.mentionsCity || candidate.domainMatch >= 0.6));
}

export function searchCandidateScore(businessName: string, url: string, title: string): number {
  const classification = classifyUrl(url);
  if (!classification || classification.kind !== "own_domain") return 0;
  return Math.max(domainNameMatch(businessName, classification.domain), tokenCoverage(businessName, title) * 0.9);
}

export interface SearchRun {
  query: string;
  ok: boolean;
  resultCount: number;
  error?: string;
}

export interface DecisionInput {
  listingHasWebsiteField: boolean; // a fonte possui campo "site" (Google Places possui; OSM é colaborativo)
  listingWebsiteKind: "none" | "own_domain" | "profile" | "free_builder";
  searchConfigured: boolean;
  searchRuns: SearchRun[];
  candidates: CandidateEvaluation[];
}

export interface WebsiteDecision {
  status: WebsiteStatus;
  confidence: VerificationConfidence;
  websiteUrl: string | null;
  issues: string[];
  summary: string;
}

export function decideWebsiteStatus(input: DecisionInput): WebsiteDecision {
  const successfulSearches = input.searchRuns.filter((r) => r.ok).length;
  const failedSearches = input.searchRuns.filter((r) => !r.ok).length;
  const owned = input.candidates.filter(candidateBelongsToBusiness);

  // 1) Site próprio encontrado e acessado.
  const reachable = owned.find((c) => c.signals?.reachable);
  if (reachable && reachable.quality) {
    const confidence: VerificationConfidence =
      reachable.origin === "listing" || (reachable.signals?.mentionsPhone ?? false) ? "CONFIRMED" : "PROBABLE";
    if (reachable.quality.professional) {
      return {
        status: "PROFESSIONAL_WEBSITE",
        confidence,
        websiteUrl: reachable.url,
        issues: reachable.quality.issues,
        summary: "Site próprio encontrado e funcionando sem problemas relevantes.",
      };
    }
    return {
      status: "WEBSITE_WITH_ISSUES",
      confidence,
      websiteUrl: reachable.url,
      issues: reachable.quality.issues,
      summary: `Site próprio encontrado com ${reachable.quality.issues.length} problema(s) aparente(s).`,
    };
  }

  // 2) Site próprio informado, mas indisponível.
  const brokenListing = owned.find((c) => c.origin === "listing" && !c.signals?.reachable);
  if (brokenListing) {
    if (brokenListing.fetchErrorCode === "DNS" || (brokenListing.signals?.status ?? 0) >= 400 || brokenListing.signals?.parked) {
      return {
        status: "WEBSITE_WITH_ISSUES",
        confidence: "PROBABLE",
        websiteUrl: brokenListing.url,
        issues: brokenListing.quality?.issues ?? [brokenListing.fetchError ?? "O site informado não está acessível."],
        summary: "O site informado no perfil não está acessível.",
      };
    }
    return {
      status: "INCONCLUSIVE",
      confidence: "UNVERIFIED",
      websiteUrl: brokenListing.url,
      issues: [brokenListing.fetchError ?? "Não foi possível acessar o site informado."],
      summary: "Há um site informado, mas não foi possível acessá-lo agora (tente novamente mais tarde).",
    };
  }

  // 3) Site em construtor gratuito (subdomínio): presença fraca.
  if (input.listingWebsiteKind === "free_builder") {
    return {
      status: "WEBSITE_WITH_ISSUES",
      confidence: "PROBABLE",
      websiteUrl: null,
      issues: ["Usa página em construtor gratuito, sem domínio próprio."],
      summary: "A empresa usa uma página em subdomínio gratuito, sem domínio próprio.",
    };
  }

  // 4) Nenhum site próprio encontrado.
  if (input.searchConfigured && failedSearches > 0 && successfulSearches === 0) {
    return {
      status: "INCONCLUSIVE",
      confidence: "UNVERIFIED",
      websiteUrl: null,
      issues: [],
      summary: "A busca web falhou; não é possível concluir se a empresa tem site.",
    };
  }
  const ambiguous = input.candidates.some((c) => !candidateBelongsToBusiness(c) && c.domainMatch >= 0.6 && !c.signals);
  if (successfulSearches >= 2 && !ambiguous && input.listingWebsiteKind !== "own_domain") {
    return {
      status: "NO_WEBSITE_CONFIRMED",
      confidence: "CONFIRMED",
      websiteUrl: null,
      issues: [],
      summary: `Nenhum site próprio encontrado: perfil sem site e ${successfulSearches} buscas sem domínio oficial.`,
    };
  }
  if (successfulSearches >= 1 || input.listingHasWebsiteField) {
    return {
      status: "NO_WEBSITE_LIKELY",
      confidence: "PROBABLE",
      websiteUrl: null,
      issues: [],
      summary:
        successfulSearches >= 1
          ? "Nenhum site próprio encontrado, mas a verificação foi parcial (uma busca)."
          : "O perfil da empresa não informa site; busca web não configurada para confirmar.",
    };
  }
  return {
    status: "NO_WEBSITE_LIKELY",
    confidence: "UNVERIFIED",
    websiteUrl: null,
    issues: [],
    summary: "A fonte não informa site e não há busca web configurada para confirmar.",
  };
}
