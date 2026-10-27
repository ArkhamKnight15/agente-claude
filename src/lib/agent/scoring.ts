import type { Priority, VerificationConfidence, WebsiteStatus } from "@/generated/prisma/enums";

/**
 * Pontuação de potencial comercial (0–100), explicável fator a fator.
 * É uma estimativa baseada nos dados disponíveis — não mede interesse real do cliente.
 */

export interface ScoringInput {
  websiteStatus: WebsiteStatus;
  websiteConfidence: VerificationConfidence;
  businessStatus?: string | null;
  hasPhone: boolean;
  phoneIsMobile: boolean;
  hasWhatsapp: boolean;
  hasEmail: boolean;
  hasSocialProfile: boolean;
  rating?: number | null;
  reviewCount?: number | null;
  nicheFit: number; // 0–10
}

export interface ScoreFactor {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface ScoreResult {
  score: number;
  priority: Priority;
  factors: ScoreFactor[];
  disqualified: boolean;
  caps: string[];
  summary: string;
}

export interface PriorityThresholds {
  highPriorityMin: number;
  mediumPriorityMin: number;
}

function websiteFactor(input: ScoringInput): ScoreFactor {
  const max = 35;
  const map: Record<WebsiteStatus, [number, string]> = {
    NO_WEBSITE_CONFIRMED: [35, "Sem site próprio, confirmado em mais de uma verificação."],
    NO_WEBSITE_LIKELY: [28, "Provavelmente sem site próprio (verificação parcial)."],
    WEBSITE_WITH_ISSUES: [22, "Tem site, mas com problemas aparentes."],
    INCONCLUSIVE: [12, "Verificação de site inconclusiva."],
    NOT_CHECKED: [8, "Site ainda não verificado."],
    PROFESSIONAL_WEBSITE: [0, "Já possui site profissional."],
  };
  const [points, detail] = map[input.websiteStatus];
  return { key: "website", label: "Ausência de site próprio", points, max, detail };
}

function activityFactor(input: ScoringInput): ScoreFactor {
  const max = 15;
  const status = input.businessStatus?.toUpperCase();
  let points = 6;
  let detail = "Situação de funcionamento não informada pela fonte.";
  if (status === "OPERATIONAL") {
    points = 15;
    detail = "Fonte indica que o negócio está em funcionamento.";
  } else if (status === "CLOSED_TEMPORARILY") {
    points = 3;
    detail = "Fonte indica fechamento temporário.";
  } else if (status === "CLOSED_PERMANENTLY") {
    points = 0;
    detail = "Fonte indica fechamento definitivo.";
  } else if ((input.reviewCount ?? 0) > 0) {
    points = 10;
    detail = "Há avaliações públicas, indício de negócio ativo.";
  }
  return { key: "activity", label: "Negócio ativo", points, max, detail };
}

function channelFactor(input: ScoringInput): ScoreFactor {
  const max = 15;
  let points = 0;
  const parts: string[] = [];
  if (input.hasPhone) {
    points += 8;
    parts.push("telefone comercial público");
  }
  if (input.hasWhatsapp) {
    points += 4;
    parts.push("WhatsApp informado pela própria empresa");
  } else if (input.phoneIsMobile) {
    points += 4;
    parts.push("número de celular (WhatsApp não confirmado)");
  }
  if (input.hasEmail) {
    points += 3;
    parts.push("e-mail comercial público");
  }
  return {
    key: "channels",
    label: "Canal comercial público",
    points: Math.min(points, max),
    max,
    detail: parts.length ? `Possui ${parts.join(", ")}.` : "Nenhum canal de contato público encontrado.",
  };
}

function reputationFactor(input: ScoringInput): ScoreFactor {
  const max = 15;
  const reviews = input.reviewCount ?? 0;
  let points = reviews >= 50 ? 10 : reviews >= 15 ? 8 : reviews >= 5 ? 5 : reviews >= 1 ? 3 : 1;
  const rating = input.rating ?? null;
  if (rating !== null && reviews >= 3) {
    if (rating >= 4.3) points += 5;
    else if (rating >= 3.8) points += 3;
  }
  const detail =
    reviews > 0
      ? `${reviews} avaliação(ões)${rating !== null ? `, nota ${rating.toFixed(1)}` : ""}: há clientes ativos para atrair.`
      : "Sem avaliações públicas na fonte consultada.";
  return { key: "reputation", label: "Movimento e reputação", points: Math.min(points, max), max, detail };
}

function improvementFactor(input: ScoringInput): ScoreFactor {
  const max = 10;
  let points = 0;
  let detail = "Já tem site profissional — pouca margem de melhoria com um site de entrada.";
  if (input.websiteStatus === "WEBSITE_WITH_ISSUES") {
    points = 7;
    detail = "Site atual pode ser substituído por uma versão moderna.";
  } else if (input.websiteStatus !== "PROFESSIONAL_WEBSITE") {
    if (input.hasSocialProfile) {
      points = 10;
      detail = "Já investe em redes sociais; o conteúdo pode alimentar o site.";
    } else {
      points = 6;
      detail = "Presença digital mínima — um site organiza as informações do negócio.";
    }
  }
  return { key: "improvement", label: "Possibilidade de melhorar a presença digital", points, max, detail };
}

function fitFactor(input: ScoringInput): ScoreFactor {
  const max = 10;
  let points = Math.max(0, Math.min(10, Math.round(input.nicheFit)));
  let detail = `Nicho com compatibilidade ${points}/10 com um site de entrada.`;
  if ((input.reviewCount ?? 0) > 1500) {
    points = Math.max(0, points - 5);
    detail += " Volume muito alto de avaliações sugere porte maior (rede/franquia).";
  }
  return { key: "fit", label: "Compatibilidade com o pacote", points, max, detail };
}

export function priorityFor(score: number, thresholds: PriorityThresholds): Priority {
  if (score >= thresholds.highPriorityMin) return "HIGH";
  if (score >= thresholds.mediumPriorityMin) return "MEDIUM";
  return "LOW";
}

export function computeLeadScore(input: ScoringInput, thresholds: PriorityThresholds): ScoreResult {
  const factors = [
    websiteFactor(input),
    activityFactor(input),
    channelFactor(input),
    reputationFactor(input),
    improvementFactor(input),
    fitFactor(input),
  ];
  const score = Math.max(0, Math.min(100, factors.reduce((sum, f) => sum + f.points, 0)));
  let priority = priorityFor(score, thresholds);
  const caps: string[] = [];
  let disqualified = false;

  if (input.businessStatus?.toUpperCase() === "CLOSED_PERMANENTLY") {
    disqualified = true;
    priority = "LOW";
    caps.push("Empresa marcada como fechada definitivamente.");
  }
  if (input.websiteStatus === "PROFESSIONAL_WEBSITE" && input.websiteConfidence !== "UNVERIFIED") {
    disqualified = true;
    priority = "LOW";
    caps.push("Já possui site profissional.");
  }
  if (!input.hasPhone && !input.hasEmail && !input.hasWhatsapp && priority === "HIGH") {
    priority = "MEDIUM";
    caps.push("Sem canal de contato público: prioridade limitada a média.");
  }

  const strongest = [...factors]
    .filter((f) => f.points / f.max >= 0.6)
    .map((f) => f.label.toLowerCase())
    .slice(0, 3);
  const summary = `${score}/100${strongest.length ? ` — destaques: ${strongest.join(", ")}` : ""}.${
    caps.length ? ` ${caps.join(" ")}` : ""
  }`;

  return { score, priority, factors, disqualified, caps, summary };
}
