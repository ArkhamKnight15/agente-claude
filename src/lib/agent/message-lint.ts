import type { WebsiteStatus } from "@/generated/prisma/enums";
import { formatBRL } from "@/lib/format";
import { normalizeText } from "@/lib/text";

/**
 * Verificações de conformidade do texto antes do envio. Gera alertas para revisão
 * humana — não bloqueia, porque o usuário pode ter acordado condições diferentes.
 */

export interface LintContext {
  price: number;
  includedFeatures: string[];
  maxChars: number;
  websiteStatus: WebsiteStatus;
  allowedUrls: string[];
}

const PROMISE_ITEMS: Array<{ term: RegExp; label: string; keywords: string[] }> = [
  { term: /hospedagem/i, label: "hospedagem", keywords: ["hospedagem"] },
  { term: /dom[ií]nio/i, label: "domínio", keywords: ["dominio"] },
  { term: /manuten[cç][aã]o/i, label: "manutenção", keywords: ["manutencao"] },
  { term: /suporte (cont[ií]nuo|mensal|ilimitado)/i, label: "suporte contínuo", keywords: ["suporte continuo", "suporte mensal"] },
  { term: /loja virtual|e-?commerce/i, label: "loja virtual", keywords: ["loja virtual", "ecommerce", "e commerce"] },
  { term: /logo(tipo|marca)?\b/i, label: "logotipo", keywords: ["logo"] },
];

const OVERPROMISE = [
  /garant(o|imos|ia de) (mais )?(clientes|vendas|resultado)/i,
  /primeira p[aá]gina do google/i,
  /primeiro lugar no google/i,
  /100% garantido/i,
  /dobrar (suas|as) vendas/i,
];

const UNVERIFIED_ANALYSIS = [/analisei (o|seu) site/i, /vi que (o )?seu site/i, /notei que (o )?site/i];

export function lintOutboundMessage(text: string, ctx: LintContext): string[] {
  const warnings: string[] = [];
  const included = normalizeText(ctx.includedFeatures.join(" "));

  for (const item of PROMISE_ITEMS) {
    if (item.term.test(text) && !item.keywords.some((k) => included.includes(k))) {
      // Mencionar como "não incluído" é permitido.
      const negated = new RegExp(`(n[aã]o (inclui|inclu[ií]do|est[aá] inclu[ií]d[oa])|sem)[^.]{0,40}${item.term.source}`, "i");
      if (!negated.test(text)) {
        warnings.push(`Menciona ${item.label}, que não consta como incluído no pacote.`);
      }
    }
  }

  const prices = [...text.matchAll(/R\$\s?([\d.]+(?:,\d{2})?)/g)].map((m) => Number(m[1].replace(/\./g, "").replace(",", ".")));
  for (const value of prices) {
    if (Math.abs(value - ctx.price) > 0.009) {
      warnings.push(`Cita ${formatBRL(value)}, diferente do preço configurado (${formatBRL(ctx.price)}).`);
    }
  }

  if (OVERPROMISE.some((re) => re.test(text))) warnings.push("Contém promessa de resultado que não pode ser garantida.");

  if (
    ctx.websiteStatus !== "WEBSITE_WITH_ISSUES" &&
    ctx.websiteStatus !== "PROFESSIONAL_WEBSITE" &&
    UNVERIFIED_ANALYSIS.some((re) => re.test(text))
  ) {
    warnings.push("Afirma ter analisado um site que não foi verificado.");
  }

  const urls = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  for (const url of urls) {
    if (!ctx.allowedUrls.some((allowed) => allowed && url.startsWith(allowed))) {
      warnings.push(`Contém link não reconhecido: ${url}`);
    }
  }

  if (text.length > ctx.maxChars) warnings.push(`Texto com ${text.length} caracteres (limite configurado: ${ctx.maxChars}).`);
  if ((text.match(/!/g) ?? []).length > 3) warnings.push("Muitos pontos de exclamação — pode soar como spam.");
  const letters = text.replace(/[^A-Za-zÀ-ú]/g, "");
  if (letters.length > 20 && letters === letters.toUpperCase()) warnings.push("Texto todo em maiúsculas.");

  return [...new Set(warnings)];
}
