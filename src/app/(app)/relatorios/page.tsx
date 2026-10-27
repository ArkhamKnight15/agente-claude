import type { Metadata } from "next";
import Link from "next/link";
import { Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard, MiniTable } from "@/components/charts/chart-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { requireUser } from "@/server/auth/session";
import { getReport, MIN_SAMPLE, type RateRow } from "@/server/services/reports";

export const metadata: Metadata = { title: "Relatórios" };

const RANGES = [
  { key: "30", label: "Últimos 30 dias" },
  { key: "90", label: "Últimos 90 dias" },
  { key: "365", label: "Últimos 12 meses" },
];

function RateTable({ rows, first }: { rows: RateRow[]; first: string }) {
  return (
    <MiniTable
      headers={[first, "Envios", "Respostas", "Interessados", "Taxa"]}
      rows={rows.map((r) => [
        <span key="l" className="inline-flex items-center gap-2">{r.label}{!r.enoughData ? <Badge>amostra pequena</Badge> : null}</span>,
        r.sent,
        r.replied,
        r.interested,
        formatPercent(r.rate),
      ])}
    />
  );
}

function rateBars(rows: RateRow[]) {
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    value: (r.rate ?? 0) * 100,
    display: formatPercent(r.rate),
    detail: `${r.replied} de ${r.sent} envios${r.enoughData ? "" : ` — menos de ${MIN_SAMPLE} envios, sem conclusão`}`,
    muted: !r.enoughData,
  }));
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireUser("report:read");
  const requested = (await searchParams).range;
  const range = RANGES.find((opt) => opt.key === requested)?.key ?? "90";
  const to = new Date();
  const from = new Date(to.getTime() - Number(range) * 86400_000);
  const r = await getReport(from, to);
  const funnel = r.funnel.filter((f) => !["LOST", "DO_NOT_CONTACT"].includes(f.stage));

  return (
    <>
      <PageHeader title="Relatórios e aprendizado" description={`Taxa de resposta = respostas em até 7 dias após a primeira mensagem. Conclusões só aparecem com pelo menos ${MIN_SAMPLE} envios por grupo.`} />
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Período">
        {RANGES.map((opt) => (
          <Link key={opt.key} href={`/relatorios?range=${opt.key}`} aria-current={opt.key === range ? "true" : undefined}
            className={cn("rounded-full px-3 py-1 text-13", opt.key === range ? "bg-fg font-medium text-bg" : "border border-border text-fg-2 hover:bg-surface-2")}>
            {opt.label}
          </Link>
        ))}
      </nav>

      <Card className="mb-6">
        <CardHeader title="O que os dados mostram" description={`${r.totals.sent} primeiras mensagens enviadas no período · ${r.totals.replied} com resposta (${formatPercent(r.totals.rate)})`} />
        <ul className="divide-y divide-border">
          {r.insights.map((i) => (
            <li key={i.text} className="flex gap-3 px-5 py-3 text-13 text-fg-2">
              {i.tone === "positive" ? <TrendingUp className="mt-0.5 size-4 shrink-0 text-success" aria-label="Positivo" /> : i.tone === "warning" ? <TrendingDown className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Atenção" /> : <Lightbulb className="mt-0.5 size-4 shrink-0 text-fg-3" aria-label="Observação" />}
              {i.text}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Taxa de resposta por nicho" description="Barras esmaecidas: amostra insuficiente." chart={<BarList data={rateBars(r.byNiche)} max={100} ariaLabel="Taxa de resposta por nicho" />} table={<RateTable rows={r.byNiche} first="Nicho" />} empty={r.byNiche.length === 0 ? <p className="py-8 text-center text-13 text-fg-3">Sem envios no período.</p> : undefined} />
        <ChartCard title="Mensagens: teste A/B" description={r.variantTest ? (r.variantTest.significant ? "Diferença estatisticamente significativa." : "Diferença ainda não significativa.") : "Ative o teste A/B nas configurações do agente."} chart={<BarList data={rateBars(r.byVariant)} max={100} ariaLabel="Taxa de resposta por variante" />} table={<RateTable rows={r.byVariant} first="Variante" />} empty={r.byVariant.length === 0 ? <p className="py-8 text-center text-13 text-fg-3">Sem envios no período.</p> : undefined} />
        <ChartCard title="Canais" chart={<BarList data={rateBars(r.byChannel)} max={100} ariaLabel="Taxa de resposta por canal" />} table={<RateTable rows={r.byChannel} first="Canal" />} empty={r.byChannel.length === 0 ? <p className="py-8 text-center text-13 text-fg-3">Sem envios no período.</p> : undefined} />
        <ChartCard title="Funil comercial" description="Leads que chegaram a cada etapa (histórico)." chart={<BarList data={funnel.map((f) => ({ key: f.stage, label: f.label, value: f.reached, detail: `${f.current} atualmente nesta etapa` }))} ariaLabel="Funil comercial" />} table={<MiniTable headers={["Etapa", "Chegaram", "Atualmente"]} rows={funnel.map((f) => [f.label, f.reached, f.current])} />} />
        <ChartCard title="Dia da semana do envio" chart={<BarList data={rateBars(r.byWeekday)} max={100} ariaLabel="Taxa por dia da semana" />} table={<RateTable rows={r.byWeekday} first="Dia" />} empty={r.byWeekday.length === 0 ? <p className="py-8 text-center text-13 text-fg-3">Sem envios no período.</p> : undefined} />
        <ChartCard title="Horário do envio" chart={<BarList data={rateBars(r.byHour)} max={100} ariaLabel="Taxa por horário" />} table={<RateTable rows={r.byHour} first="Hora" />} empty={r.byHour.length === 0 ? <p className="py-8 text-center text-13 text-fg-3">Sem envios no período.</p> : undefined} />
        <ChartCard title="Regiões com mais empresas sem site" description="Entre os leads já verificados." chart={<BarList data={r.regions.map((g) => ({ key: `${g.city}-${g.state}`, label: `${g.city}/${g.state}`, value: g.noWebsite, display: `${g.noWebsite}/${g.total}`, detail: `${formatPercent(g.share)} sem site` }))} ariaLabel="Empresas sem site por cidade" />} table={<MiniTable headers={["Cidade", "Verificados", "Sem site", "%"]} rows={r.regions.map((g) => [`${g.city}/${g.state}`, g.total, g.noWebsite, formatPercent(g.share)])} />} empty={r.regions.length === 0 ? <p className="py-8 text-center text-13 text-fg-3">Nenhum lead verificado.</p> : undefined} />
        <ChartCard title="Motivos de perda" chart={<BarList data={r.lossReasons.map((l) => ({ key: l.reason, label: l.label, value: l.count }))} ariaLabel="Motivos de perda" />} table={<MiniTable headers={["Motivo", "Leads"]} rows={r.lossReasons.map((l) => [l.label, l.count])} />} empty={r.lossReasons.length === 0 ? <p className="py-8 text-center text-13 text-fg-3">Nenhuma perda registrada.</p> : undefined} />
      </div>
    </>
  );
}
