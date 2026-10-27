import { formatBRL } from "@/lib/format";
import type { CommercialContext, LeadAnalysis, LeadFacts } from "@/lib/agent/lead-facts";

/**
 * Geração determinística (sem IA) de análise e mensagens. Afirma apenas fatos verificados:
 * por exemplo, só diz "não encontrei um site" quando a ausência foi confirmada.
 */

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function sourceOpening(facts: LeadFacts): string {
  if (facts.source === "GOOGLE_PLACES") return `encontrei a ${facts.name} no Google Maps`;
  if (facts.source === "OSM") return `encontrei a ${facts.name} pesquisando ${facts.nichePlural} em ${facts.city}`;
  return `estou entrando em contato com a ${facts.name}`;
}

function websiteObservation(facts: LeadFacts): string {
  switch (facts.websiteStatus) {
    case "NO_WEBSITE_CONFIRMED":
      return " e não encontrei um site próprio da empresa";
    case "WEBSITE_WITH_ISSUES":
      return facts.websiteIssues[0]
        ? ` e notei um ponto no site atual que pode ser melhorado (${lowerFirst(facts.websiteIssues[0]).replace(/\.$/, "")})`
        : " e vi que a presença online pode ser melhorada";
    default:
      return "";
  }
}

function signatureLine(ctx: CommercialContext): string {
  const parts = [ctx.senderName, ctx.senderCompany].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

export function buildWhatsappMessage(facts: LeadFacts, ctx: CommercialContext): string {
  const greeting = ctx.tone === "formal" ? "Olá, tudo bem? Meu nome é" : "Oi, tudo bem? Aqui é";
  const intro = ctx.senderName ? `${greeting} ${ctx.senderName}${ctx.senderCompany ? `, da ${ctx.senderCompany}` : ""}.` : "Olá, tudo bem?";
  const price = formatBRL(ctx.price);
  const consultative = ctx.variant?.key === "B";

  const body = consultative
    ? `Hoje, como a maioria dos clientes chega até a ${facts.name}: indicação, Instagram ou Google? Pergunto porque ${sourceOpening(facts)}${websiteObservation(facts)}. Crio sites profissionais para ${facts.nichePlural}, a partir de ${price}.`
    : `${sourceOpening(facts).replace(/^./, (c) => c.toUpperCase())}${websiteObservation(facts)}. Trabalho com criação de sites profissionais para ${facts.nichePlural} e tenho uma opção a partir de ${price}.`;

  const portfolio = ctx.portfolioUrl ? ` Alguns trabalhos: ${ctx.portfolioUrl}` : "";
  const cta = "Posso te mostrar uma ideia de como poderia ficar o site de vocês?";
  const optOut = ctx.includeOptOutHint ? " Se não fizer sentido agora, é só me avisar que não envio mais mensagens." : "";

  return `${intro} ${body}${portfolio} ${cta}${optOut}`.replace(/\s+/g, " ").trim();
}

export function buildEmail(facts: LeadFacts, ctx: CommercialContext): { subject: string; body: string } {
  const price = formatBRL(ctx.price);
  const subject = `Site profissional para a ${facts.name}`;
  const opening = ctx.tone === "formal" ? "Olá, bom dia." : "Olá, tudo bem?";
  const lines = [
    opening,
    "",
    `${ctx.senderName ? `Meu nome é ${ctx.senderName}${ctx.senderCompany ? `, da ${ctx.senderCompany}` : ""}. ` : ""}${sourceOpening(facts).replace(/^./, (c) => c.toUpperCase())}${websiteObservation(facts)}.`,
    "",
    `Crio sites profissionais para ${facts.nichePlural}, com foco em ${facts.nicheNeed}. O pacote "${ctx.packageName}" sai a partir de ${price}, com prazo estimado de ${ctx.deliveryDays} dias úteis após o envio do conteúdo, e inclui:`,
    ...ctx.features.slice(0, 5).map((f) => `• ${f}`),
    ...(ctx.notIncluded.length ? ["", `Não incluídos no pacote: ${ctx.notIncluded.slice(0, 4).join(", ").toLowerCase()}.`] : []),
    "",
    ctx.portfolioUrl ? `Alguns trabalhos: ${ctx.portfolioUrl}` : "",
    "Posso enviar uma ideia de como ficaria o site da empresa?",
    "",
    ctx.signature || signatureLine(ctx),
  ];
  return { subject, body: lines.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n").trim() };
}

export function buildTemplateAnalysis(facts: LeadFacts, ctx: CommercialContext): LeadAnalysis {
  const benefits = [...facts.nicheBenefits];
  if (facts.websiteIssues.some((i) => /celular/i.test(i))) benefits.unshift("Site adaptado para celular, onde está a maior parte dos clientes");
  if (facts.hasInstagram) benefits.push("Aproveitar o conteúdo do Instagram em um site que aparece no Google");

  const reasonParts = [facts.websiteSummary, facts.scoreSummary ? `Pontuação ${facts.scoreSummary}` : null].filter(Boolean);
  const email = buildEmail(facts, ctx);

  let nextAction = "Revisar a mensagem sugerida e aprovar o envio.";
  if (facts.priority === "LOW") nextAction = "Manter na base; não priorizar contato agora.";
  else if (!facts.hasPhone && !facts.hasEmail) nextAction = "Buscar um canal de contato público antes de abordar.";
  else if (facts.hasPhone) nextAction = "Revisar a mensagem e enviar pelo WhatsApp (envio manual ou API com opt-in).";
  else if (facts.hasEmail) nextAction = "Revisar e aprovar o e-mail de apresentação.";

  return {
    classificationReason: reasonParts.join(" ") || "Classificação baseada nos dados disponíveis.",
    identifiedNeed: `Um site para ${facts.nicheNeed}.`,
    benefits: benefits.slice(0, 5),
    salesArgument: `Por ${formatBRL(ctx.price)}, a ${facts.name} passa a ter um site próprio que ${facts.nicheNeed}, com contato direto pelo WhatsApp — sem depender só das redes sociais.`,
    whatsappMessage: buildWhatsappMessage(facts, ctx),
    emailSubject: email.subject,
    emailBody: email.body,
    nextAction,
  };
}
