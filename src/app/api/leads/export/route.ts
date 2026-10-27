import { NextResponse } from "next/server";
import { getNiche } from "@/data/niches";
import { CONFIDENCE_LABELS, PRIORITY_LABELS, STAGE_LABELS, WEBSITE_STATUS_LABELS, LOSS_REASON_LABELS } from "@/data/labels";
import { toCsv } from "@/lib/csv";
import { formatPhone } from "@/lib/phone";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/security/audit";
import { can } from "@/server/security/rbac";
import { buildLeadWhere } from "@/server/services/leads";
import { parseLeadFilters } from "@/lib/lead-filters";

/** Exporta os leads filtrados em CSV (máx. 10.000 linhas). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!can(user.role, "lead:export")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const filters = parseLeadFilters(Object.fromEntries(new URL(request.url).searchParams));
  const leads = await db.lead.findMany({ where: buildLeadWhere(filters), orderBy: { createdAt: "desc" }, take: 10_000 });
  const csv = toCsv(leads, [
    { header: "Nome", value: (l) => l.name },
    { header: "Nicho", value: (l) => getNiche(l.nicheKey)?.label ?? l.category },
    { header: "Cidade", value: (l) => l.city },
    { header: "UF", value: (l) => l.state },
    { header: "Endereço", value: (l) => l.address },
    { header: "Telefone", value: (l) => formatPhone(l.phoneE164) },
    { header: "WhatsApp", value: (l) => formatPhone(l.whatsappE164) },
    { header: "E-mail", value: (l) => l.email },
    { header: "Instagram", value: (l) => l.instagramUrl },
    { header: "Site", value: (l) => l.websiteUrl },
    { header: "Situação do site", value: (l) => WEBSITE_STATUS_LABELS[l.websiteStatus].label },
    { header: "Confiança da verificação", value: (l) => CONFIDENCE_LABELS[l.websiteConfidence].label },
    { header: "Pontuação", value: (l) => l.score },
    { header: "Prioridade", value: (l) => (l.priority ? PRIORITY_LABELS[l.priority].label : "") },
    { header: "Etapa", value: (l) => STAGE_LABELS[l.stage].label },
    { header: "Motivo da perda", value: (l) => (l.lossReason ? LOSS_REASON_LABELS[l.lossReason] : "") },
    { header: "Não contatar", value: (l) => (l.doNotContact ? "Sim" : "Não") },
    { header: "Fonte", value: (l) => l.primarySource },
    { header: "Google Maps", value: (l) => l.googleMapsUrl },
    { header: "Última verificação", value: (l) => l.lastVerifiedAt },
    { header: "Demonstração", value: (l) => (l.isDemo ? "Sim" : "Não") },
  ]);
  await audit({ userId: user.id, action: "lead.export_csv", metadata: { count: leads.length } });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
