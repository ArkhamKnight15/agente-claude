import { Prisma } from "@/generated/prisma/client";
import { rate } from "@/lib/stats";
import { toNumber } from "@/lib/format";
import { db } from "@/server/db";
import { getDefaultPackage } from "@/server/services/settings";

/** Indicadores do painel, calculados exclusivamente a partir dos dados armazenados. */

const SENT = ["SENT", "DELIVERED", "READ"] as const;

export interface DashboardMetrics {
  totalBusinesses: number;
  noWebsiteConfirmed: number;
  noWebsiteLikely: number;
  qualifiedLeads: number;
  messagesPrepared: number;
  messagesPendingApproval: number;
  messagesSent: number;
  repliesReceived: number;
  leadsContacted: number;
  leadsReplied: number;
  interested: number;
  proposalsSent: number;
  won: number;
  potentialRevenue: number;
  realizedRevenue: number;
  responseRate: number | null;
  conversionRate: number | null;
  totalCosts: number;
  costPerClient: number | null;
  byNiche: Array<{ key: string | null; total: number; noWebsite: number }>;
  byState: Array<{ state: string; total: number; noWebsite: number }>;
  topCities: Array<{ city: string; state: string; total: number }>;
  daily: Array<{ day: string; sent: number; replies: number }>;
  demoLeads: number;
  openTasksDue: number;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const since = new Date(Date.now() - 29 * 86400_000);
  since.setUTCHours(0, 0, 0, 0);

  const [
    totalBusinesses,
    noWebsiteConfirmed,
    noWebsiteLikely,
    qualifiedLeads,
    messagesPrepared,
    messagesPendingApproval,
    messagesSent,
    repliesReceived,
    leadsContacted,
    leadsReplied,
    interested,
    proposalsSent,
    wonAgg,
    openProposals,
    openOpportunitiesWithoutProposal,
    costs,
    byNiche,
    byNicheNoSite,
    byState,
    byStateNoSite,
    topCities,
    daily,
    demoLeads,
    openTasksDue,
    pkg,
  ] = await Promise.all([
    db.lead.count(),
    db.lead.count({ where: { websiteStatus: "NO_WEBSITE_CONFIRMED" } }),
    db.lead.count({ where: { websiteStatus: "NO_WEBSITE_LIKELY" } }),
    db.lead.count({ where: { priority: { in: ["HIGH", "MEDIUM"] }, stage: { not: "DO_NOT_CONTACT" } } }),
    db.message.count({ where: { direction: "OUTBOUND", status: { notIn: ["REJECTED", "CANCELLED"] } } }),
    db.message.count({ where: { direction: "OUTBOUND", status: "PENDING_APPROVAL" } }),
    db.message.count({ where: { direction: "OUTBOUND", status: { in: [...SENT] } } }),
    db.message.count({ where: { direction: "INBOUND" } }),
    db.lead.count({ where: { messages: { some: { direction: "OUTBOUND", status: { in: [...SENT] } } } } }),
    db.lead.count({ where: { messages: { some: { direction: "INBOUND" } } } }),
    db.lead.count({ where: { stage: { in: ["INTERESTED", "NEGOTIATION", "PROPOSAL_SENT", "WON"] } } }),
    db.proposal.count({ where: { sentAt: { not: null } } }),
    db.lead.aggregate({ where: { stage: "WON" }, _count: true, _sum: { dealValue: true } }),
    db.proposal.aggregate({ where: { status: { in: ["DRAFT", "APPROVED", "SENT"] }, lead: { stage: { notIn: ["WON", "LOST", "DO_NOT_CONTACT"] } } }, _sum: { price: true } }),
    db.lead.count({ where: { stage: { in: ["INTERESTED", "NEGOTIATION"] }, proposals: { none: { status: { in: ["DRAFT", "APPROVED", "SENT"] } } } } }),
    db.cost.aggregate({ _sum: { amount: true } }),
    db.lead.groupBy({ by: ["nicheKey"], _count: true, orderBy: { _count: { nicheKey: "desc" } }, take: 8 }),
    db.lead.groupBy({ by: ["nicheKey"], where: { websiteStatus: { in: ["NO_WEBSITE_CONFIRMED", "NO_WEBSITE_LIKELY"] } }, _count: true }),
    db.lead.groupBy({ by: ["state"], _count: true, orderBy: { _count: { state: "desc" } }, take: 10 }),
    db.lead.groupBy({ by: ["state"], where: { websiteStatus: { in: ["NO_WEBSITE_CONFIRMED", "NO_WEBSITE_LIKELY"] } }, _count: true }),
    db.lead.groupBy({ by: ["city", "state"], _count: true, orderBy: { _count: { city: "desc" } }, take: 6 }),
    db.$queryRaw<Array<{ day: Date; sent: bigint; replies: bigint }>>(Prisma.sql`
      SELECT d.day::date AS day,
        (SELECT count(*) FROM "Message" m WHERE m."direction" = 'OUTBOUND' AND m."status" IN ('SENT','DELIVERED','READ')
          AND (m."sentAt" AT TIME ZONE 'America/Sao_Paulo')::date = d.day::date) AS sent,
        (SELECT count(*) FROM "Message" m WHERE m."direction" = 'INBOUND'
          AND (m."receivedAt" AT TIME ZONE 'America/Sao_Paulo')::date = d.day::date) AS replies
      FROM generate_series((now() AT TIME ZONE 'America/Sao_Paulo')::date - 29, (now() AT TIME ZONE 'America/Sao_Paulo')::date, interval '1 day') AS d(day)
      ORDER BY d.day
    `),
    db.lead.count({ where: { isDemo: true } }),
    db.followUpTask.count({ where: { status: "OPEN", dueAt: { lte: new Date() } } }),
    getDefaultPackage(),
  ]);

  const noSiteByNiche = new Map(byNicheNoSite.map((r) => [r.nicheKey, r._count]));
  const noSiteByState = new Map(byStateNoSite.map((r) => [r.state, r._count]));
  const realizedRevenue = toNumber(wonAgg._sum.dealValue);
  const totalCosts = toNumber(costs._sum.amount);
  const won = wonAgg._count;

  return {
    totalBusinesses,
    noWebsiteConfirmed,
    noWebsiteLikely,
    qualifiedLeads,
    messagesPrepared,
    messagesPendingApproval,
    messagesSent,
    repliesReceived,
    leadsContacted,
    leadsReplied,
    interested,
    proposalsSent,
    won,
    // Propostas em aberto + oportunidades interessadas sem proposta (pelo preço do pacote padrão).
    potentialRevenue: toNumber(openProposals._sum.price) + openOpportunitiesWithoutProposal * (pkg?.price ?? 0),
    realizedRevenue,
    responseRate: rate(leadsReplied, leadsContacted),
    conversionRate: rate(won, leadsContacted),
    totalCosts,
    costPerClient: totalCosts > 0 && won > 0 ? totalCosts / won : null,
    byNiche: byNiche.map((r) => ({ key: r.nicheKey, total: r._count, noWebsite: noSiteByNiche.get(r.nicheKey) ?? 0 })),
    byState: byState.map((r) => ({ state: r.state, total: r._count, noWebsite: noSiteByState.get(r.state) ?? 0 })),
    topCities: topCities.map((r) => ({ city: r.city, state: r.state, total: r._count })),
    daily: daily.map((r) => ({ day: r.day.toISOString().slice(0, 10), sent: Number(r.sent), replies: Number(r.replies) })),
    demoLeads,
    openTasksDue,
  };
}
