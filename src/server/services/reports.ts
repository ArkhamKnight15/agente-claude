import { Prisma } from "@/generated/prisma/client";
import type { LeadStage, LossReason } from "@/generated/prisma/enums";
import { getNiche } from "@/data/niches";
import { LOSS_REASON_LABELS, STAGE_LABELS, STAGE_ORDER } from "@/data/labels";
import { formatPercent } from "@/lib/format";
import { rate, twoProportionTest } from "@/lib/stats";
import { db } from "@/server/db";

/**
 * Relatórios de aprendizado. Toda conclusão exige amostra mínima; abaixo dela o
 * relatório informa "dados insuficientes" em vez de sugerir uma estratégia.
 */

export const MIN_SAMPLE = 20;
const REPLY_WINDOW_DAYS = 7;

export interface RateRow {
  key: string;
  label: string;
  sent: number;
  replied: number;
  interested: number;
  rate: number | null;
  enoughData: boolean;
}

export interface Insight {
  tone: "positive" | "neutral" | "warning";
  text: string;
}

export interface ReportData {
  from: Date;
  to: Date;
  totals: { sent: number; replied: number; rate: number | null };
  byNiche: RateRow[];
  byChannel: RateRow[];
  byVariant: RateRow[];
  variantTest: { a: string; b: string; pValue: number; significant: boolean } | null;
  byWeekday: RateRow[];
  byHour: RateRow[];
  regions: Array<{ state: string; city: string; total: number; noWebsite: number; share: number | null }>;
  funnel: Array<{ stage: LeadStage; label: string; reached: number; current: number }>;
  lossReasons: Array<{ reason: LossReason; label: string; count: number }>;
  insights: Insight[];
}

interface SentRow {
  key: string | null;
  sent: bigint;
  replied: bigint;
  interested: bigint;
}

/** Mensagens iniciais enviadas no período e se houve resposta em até 7 dias. */
async function rateBy(groupExpr: Prisma.Sql, from: Date, to: Date): Promise<SentRow[]> {
  return db.$queryRaw<SentRow[]>(Prisma.sql`
    SELECT ${groupExpr} AS key,
      count(*) AS sent,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "Message" r WHERE r."leadId" = m."leadId" AND r."direction" = 'INBOUND'
          AND r."receivedAt" > m."sentAt" AND r."receivedAt" < m."sentAt" + make_interval(days => ${REPLY_WINDOW_DAYS})
      )) AS replied,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "Message" r WHERE r."leadId" = m."leadId" AND r."direction" = 'INBOUND'
          AND r."classification" IN ('INTERESTED','QUESTION')
          AND r."receivedAt" > m."sentAt" AND r."receivedAt" < m."sentAt" + make_interval(days => ${REPLY_WINDOW_DAYS})
      )) AS interested
    FROM "Message" m
    JOIN "Lead" l ON l."id" = m."leadId"
    WHERE m."direction" = 'OUTBOUND' AND m."purpose" = 'INITIAL'
      AND m."status" IN ('SENT','DELIVERED','READ')
      AND m."sentAt" >= ${from} AND m."sentAt" < ${to}
    GROUP BY 1
    ORDER BY 2 DESC
  `);
}

function toRows(rows: SentRow[], label: (key: string | null) => string): RateRow[] {
  return rows.map((r) => {
    const sent = Number(r.sent);
    const replied = Number(r.replied);
    return {
      key: r.key ?? "—",
      label: label(r.key),
      sent,
      replied,
      interested: Number(r.interested),
      rate: rate(replied, sent),
      enoughData: sent >= MIN_SAMPLE,
    };
  });
}

function formatP(p: number): string {
  return p < 0.001 ? "<0,001" : p.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export async function getReport(from: Date, to: Date): Promise<ReportData> {
  const sp = Prisma.sql`(m."sentAt" AT TIME ZONE 'America/Sao_Paulo')`;
  const [niche, channel, variant, weekday, hour, regionRows, reachedRows, currentRows, lossRows] = await Promise.all([
    rateBy(Prisma.sql`l."nicheKey"`, from, to),
    rateBy(Prisma.sql`m."channel"::text`, from, to),
    rateBy(Prisma.sql`m."variant"`, from, to),
    rateBy(Prisma.sql`extract(dow from ${sp})::int::text`, from, to),
    rateBy(Prisma.sql`lpad(extract(hour from ${sp})::int::text, 2, '0')`, from, to),
    db.$queryRaw<Array<{ state: string; city: string; total: bigint; nowebsite: bigint }>>(Prisma.sql`
      SELECT "state", "city", count(*) AS total,
        count(*) FILTER (WHERE "websiteStatus" IN ('NO_WEBSITE_CONFIRMED','NO_WEBSITE_LIKELY')) AS nowebsite
      FROM "Lead" WHERE "websiteStatus" <> 'NOT_CHECKED'
      GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15
    `),
    db.$queryRaw<Array<{ stage: string; leads: bigint }>>(Prisma.sql`
      SELECT "metadata"->>'to' AS stage, count(DISTINCT "leadId") AS leads
      FROM "Activity" WHERE "type" = 'STAGE_CHANGED' GROUP BY 1
    `),
    db.lead.groupBy({ by: ["stage"], _count: true }),
    db.lead.groupBy({ by: ["lossReason"], where: { stage: "LOST", lossReason: { not: null } }, _count: true }),
  ]);

  const byNiche = toRows(niche, (k) => getNiche(k)?.label ?? (k ? k : "Sem nicho"));
  const byChannel = toRows(channel, (k) => (k === "WHATSAPP" ? "WhatsApp" : k === "EMAIL" ? "E-mail" : "—"));
  const byVariant = toRows(variant, (k) => (k ? `Variante ${k}` : "Sem teste A/B"));
  const byWeekday = toRows(weekday, (k) => WEEKDAYS[Number(k)] ?? "—").sort((a, b) => Number(a.key) - Number(b.key));
  const byHour = toRows(hour, (k) => `${k}h`).sort((a, b) => a.key.localeCompare(b.key));

  const sent = byChannel.reduce((s, r) => s + r.sent, 0);
  const replied = byChannel.reduce((s, r) => s + r.replied, 0);
  const overall = rate(replied, sent);

  // Teste A/B entre as duas variantes com mais envios.
  const variants = byVariant.filter((v) => v.key !== "—").sort((a, b) => b.sent - a.sent);
  let variantTest: ReportData["variantTest"] = null;
  if (variants.length >= 2) {
    const [a, b] = variants;
    const test = twoProportionTest(a.replied, a.sent, b.replied, b.sent);
    if (test) variantTest = { a: a.key, b: b.key, pValue: test.pValue, significant: test.significant && a.enoughData && b.enoughData };
  }

  const reached = new Map(reachedRows.map((r) => [r.stage, Number(r.leads)]));
  const current = new Map(currentRows.map((r) => [r.stage, r._count]));
  const funnel = STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage].label,
    reached: Math.max(reached.get(stage) ?? 0, current.get(stage) ?? 0),
    current: current.get(stage) ?? 0,
  }));

  const insights: Insight[] = [];
  if (sent < MIN_SAMPLE) {
    insights.push({
      tone: "neutral",
      text: `Ainda há poucos envios no período (${sent}). Conclusões sobre nichos, canais e mensagens exigem pelo menos ${MIN_SAMPLE} envios por grupo.`,
    });
  } else {
    const strongNiches = byNiche.filter((n) => n.enoughData && n.rate !== null && overall !== null && n.rate >= overall * 1.3);
    for (const n of strongNiches.slice(0, 2)) {
      insights.push({ tone: "positive", text: `${n.label}: taxa de resposta de ${formatPercent(n.rate)} (${n.sent} envios), acima da média geral de ${formatPercent(overall)}.` });
    }
    const weakNiches = byNiche.filter((n) => n.enoughData && n.rate !== null && overall !== null && n.rate <= overall * 0.6);
    for (const n of weakNiches.slice(0, 1)) {
      insights.push({ tone: "warning", text: `${n.label}: ${formatPercent(n.rate)} de resposta em ${n.sent} envios — considere ajustar a abordagem para este nicho.` });
    }
    const channels = byChannel.filter((c) => c.enoughData);
    if (channels.length === 2) {
      const [x, y] = channels;
      const test = twoProportionTest(x.replied, x.sent, y.replied, y.sent);
      insights.push(
        test?.significant
          ? { tone: "positive", text: `${(x.rate ?? 0) > (y.rate ?? 0) ? x.label : y.label} tem taxa de resposta maior (${formatPercent(x.rate)} vs ${formatPercent(y.rate)}, p=${formatP(test.pValue)}).` }
          : { tone: "neutral", text: `Sem diferença estatisticamente significativa entre WhatsApp e e-mail até agora.` },
      );
    }
  }
  if (variantTest) {
    const a = variants[0];
    const b = variants[1];
    insights.push(
      variantTest.significant
        ? { tone: "positive", text: `Teste A/B: ${(a.rate ?? 0) > (b.rate ?? 0) ? a.label : b.label} responde melhor (${formatPercent(a.rate)} vs ${formatPercent(b.rate)}, p=${formatP(variantTest.pValue)}).` }
        : { tone: "neutral", text: `Teste A/B em andamento: ${a.label} ${formatPercent(a.rate)} (${a.sent}) vs ${b.label} ${formatPercent(b.rate)} (${b.sent}) — diferença ainda não significativa (p=${formatP(variantTest.pValue)}).` },
    );
  } else if (sent >= 30) {
    insights.push({ tone: "neutral", text: "Considere ativar o teste A/B de mensagens nas Configurações do agente para comparar abordagens." });
  }
  const timeGroups = byWeekday.filter((w) => w.enoughData);
  if (timeGroups.length >= 2) {
    const best = [...timeGroups].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0];
    const worst = [...timeGroups].sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))[0];
    const test = twoProportionTest(best.replied, best.sent, worst.replied, worst.sent);
    if (test?.significant) {
      insights.push({ tone: "positive", text: `${best.label} tem a melhor taxa de resposta (${formatPercent(best.rate)}), significativamente acima de ${worst.label} (${formatPercent(worst.rate)}).` });
    }
  }
  const topLoss = lossRows.sort((a, b) => b._count - a._count)[0];
  if (topLoss && topLoss._count >= 5) {
    insights.push({ tone: "warning", text: `Principal motivo de perda: ${LOSS_REASON_LABELS[topLoss.lossReason!]} (${topLoss._count} leads).` });
  }
  const drop = funnel.find((f, i) => i > 3 && i < 9 && funnel[i - 1].reached >= MIN_SAMPLE && f.reached / Math.max(1, funnel[i - 1].reached) < 0.25);
  if (drop) {
    const prev = funnel[STAGE_ORDER.indexOf(drop.stage) - 1];
    insights.push({ tone: "warning", text: `Maior queda do funil: de “${prev.label}” (${prev.reached}) para “${drop.label}” (${drop.reached}).` });
  }

  return {
    from,
    to,
    totals: { sent, replied, rate: overall },
    byNiche,
    byChannel,
    byVariant,
    variantTest,
    byWeekday,
    byHour,
    regions: regionRows.map((r) => ({
      state: r.state,
      city: r.city,
      total: Number(r.total),
      noWebsite: Number(r.nowebsite),
      share: rate(Number(r.nowebsite), Number(r.total)),
    })),
    funnel,
    lossReasons: lossRows.map((r) => ({ reason: r.lossReason!, label: LOSS_REASON_LABELS[r.lossReason!], count: r._count })),
    insights,
  };
}
