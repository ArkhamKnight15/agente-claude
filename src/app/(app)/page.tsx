import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Megaphone, MessageSquareWarning, Plus } from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard, LegendItem, MiniTable } from "@/components/charts/chart-card";
import { DailyChart } from "@/components/charts/daily-chart";
import { DAILY_SERIES } from "@/components/charts/daily-series";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { getNiche } from "@/data/niches";
import { formatBRL, formatNumber, formatPercent } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getDashboardMetrics } from "@/server/services/metrics";

export const metadata: Metadata = { title: "Dashboard" };

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-13 text-fg-3">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-fg-3">{hint}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl border border-border bg-surface p-4 shadow-xs transition-colors hover:border-border-strong">
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-xs">{body}</div>
  );
}

export default async function DashboardPage() {
  const user = await requireUser("dashboard:read");
  const m = await getDashboardMetrics();
  const firstName = user.name.split(" ")[0];

  if (m.totalBusinesses === 0) {
    return (
      <>
        <PageHeader title={`Olá, ${firstName}`} description="Os indicadores aparecem aqui assim que as primeiras empresas forem pesquisadas." />
        <Card>
          <EmptyState
            icon={Megaphone}
            title="Nenhuma empresa pesquisada ainda"
            description="Crie uma campanha escolhendo cidade, nicho e quantidade. O agente pesquisa, verifica os sites e prepara as mensagens para sua aprovação."
            action={
              <>
                <ButtonLink href="/campanhas/nova" variant="primary">
                  <Plus /> Nova campanha
                </ButtonLink>
                <ButtonLink href="/integracoes">Configurar integrações</ButtonLink>
              </>
            }
          />
        </Card>
      </>
    );
  }

  const nicheData = m.byNiche.map((n) => ({
    key: n.key ?? "none",
    label: getNiche(n.key)?.label ?? n.key ?? "Sem nicho",
    value: n.total,
    detail: `${n.noWebsite} sem site (confirmado ou provável)`,
  }));
  const stateData = m.byState.map((s) => ({ key: s.state, label: s.state, value: s.total, detail: `${s.noWebsite} sem site` }));

  return (
    <>
      <PageHeader
        title={`Olá, ${firstName}`}
        description="Indicadores calculados a partir dos dados registrados no sistema."
        actions={
          <ButtonLink href="/campanhas/nova" variant="primary">
            <Plus /> Nova campanha
          </ButtonLink>
        }
      />

      {m.messagesPendingApproval > 0 || m.openTasksDue > 0 ? (
        <Alert
          tone="info"
          className="mb-6"
          title={`${m.messagesPendingApproval} mensagem(ns) aguardando sua aprovação · ${m.openTasksDue} próximo(s) passo(s) para hoje`}
          action={
            <ButtonLink href={m.messagesPendingApproval > 0 ? "/mensagens" : "/funil"} size="sm" variant="secondary">
              Revisar <ArrowRight />
            </ButtonLink>
          }
        >
          Nada é enviado sem aprovação.
        </Alert>
      ) : null}

      <section aria-label="Resultados" className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-xs sm:col-span-2">
          <p className="text-13 text-fg-3">Receita realizada</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight">{formatBRL(m.realizedRevenue)}</p>
          <p className="mt-2 text-13 text-fg-3">
            {m.won} venda(s) fechada(s) · receita potencial em aberto {formatBRL(m.potentialRevenue)}
          </p>
        </div>
        <Stat label="Taxa de resposta" value={formatPercent(m.responseRate)} hint={`${m.leadsReplied} de ${m.leadsContacted} leads contatados`} />
        <Stat label="Taxa de conversão" value={formatPercent(m.conversionRate)} hint="Vendas ÷ leads contatados" />
      </section>

      <section aria-label="Prospecção" className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Empresas pesquisadas" value={formatNumber(m.totalBusinesses)} href="/leads" />
        <Stat label="Sem site confirmado" value={formatNumber(m.noWebsiteConfirmed)} hint={`+${m.noWebsiteLikely} prováveis`} href="/leads?websiteStatus=NO_WEBSITE_CONFIRMED" />
        <Stat label="Leads qualificados" value={formatNumber(m.qualifiedLeads)} hint="Prioridade alta ou média" href="/leads?priority=HIGH" />
        <Stat label="Contatos preparados" value={formatNumber(m.messagesPrepared)} href="/mensagens" />
        <Stat label="Mensagens enviadas" value={formatNumber(m.messagesSent)} hint={`${m.repliesReceived} resposta(s)`} href="/mensagens?box=sent" />
        <Stat label="Interessados" value={formatNumber(m.interested)} hint={`${m.proposalsSent} proposta(s) enviada(s)`} href="/funil" />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="Envios e respostas — últimos 30 dias"
          description="Por dia, no horário de Brasília."
          legend={
            <div className="flex flex-wrap gap-4">
              {DAILY_SERIES.map((s) => (
                <LegendItem key={s.key} color={s.color} label={s.label} shape="line" />
              ))}
            </div>
          }
          empty={m.messagesSent === 0 && m.repliesReceived === 0 ? <EmptyState icon={MessageSquareWarning} title="Nenhum envio registrado" description="Aprove e envie mensagens na Central de mensagens." className="py-10" /> : undefined}
          chart={<DailyChart data={m.daily} />}
          table={<MiniTable headers={["Dia", "Enviadas", "Respostas"]} rows={m.daily.filter((d) => d.sent || d.replies).map((d) => [d.day.split("-").toReversed().join("/"), d.sent, d.replies])} />}
        />
        <ChartCard
          className="lg:col-span-2"
          title="Leads por nicho"
          description="Passe o mouse para ver quantos estão sem site."
          chart={<BarList data={nicheData} ariaLabel="Leads por nicho" />}
          table={<MiniTable headers={["Nicho", "Leads", "Sem site"]} rows={m.byNiche.map((n) => [getNiche(n.key)?.label ?? n.key ?? "—", n.total, n.noWebsite])} />}
        />
        <ChartCard
          className="lg:col-span-2"
          title="Leads por estado"
          chart={<BarList data={stateData} ariaLabel="Leads por estado" />}
          table={<MiniTable headers={["UF", "Leads", "Sem site"]} rows={m.byState.map((s) => [s.state, s.total, s.noWebsite])} />}
        />
        <Card className="lg:col-span-3">
          <div className="px-5 pt-4">
            <h2 className="text-sm font-semibold">Principais cidades e custos</h2>
          </div>
          <div className="grid gap-6 p-5 sm:grid-cols-2">
            <ul className="divide-y divide-border text-13">
              {m.topCities.map((c) => (
                <li key={`${c.city}-${c.state}`} className="flex items-center justify-between py-2">
                  <Link href={`/leads?state=${c.state}&city=${encodeURIComponent(c.city)}`} className="hover:text-accent">
                    {c.city}/{c.state}
                  </Link>
                  <span className="font-medium tabular-nums">{c.total}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-3 text-13">
              <div className="flex justify-between">
                <dt className="text-fg-3">Custos informados</dt>
                <dd className="font-medium">{formatBRL(m.totalCosts)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-3">Custo por cliente</dt>
                <dd className="font-medium">{m.costPerClient !== null ? formatBRL(m.costPerClient) : "—"}</dd>
              </div>
              <p className="text-xs text-fg-3">
                {m.totalCosts === 0 ? (
                  <>
                    Registre seus custos em{" "}
                    <Link href="/configuracoes/dados#custos" className="underline underline-offset-2">
                      Dados e LGPD → Custos
                    </Link>{" "}
                    para calcular o custo por cliente.
                  </>
                ) : (
                  "Custo total ÷ vendas fechadas."
                )}
              </p>
            </dl>
          </div>
        </Card>
      </div>
    </>
  );
}
