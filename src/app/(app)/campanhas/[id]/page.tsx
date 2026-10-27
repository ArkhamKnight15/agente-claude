import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pause, Play, XCircle } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, PageHeader, ProgressBar } from "@/components/ui/misc";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { CampaignStatusBadge } from "@/components/shared/status-badges";
import { PRIORITY_LABELS, PROVIDER_LABELS, WEBSITE_STATUS_LABELS } from "@/data/labels";
import { formatBRL, formatDateTime, formatPercent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { requireUser } from "@/server/auth/session";
import { campaignControlAction } from "@/server/actions/outreach";
import { NotFoundError } from "@/server/errors";
import { can } from "@/server/security/rbac";
import { getCampaignDetail } from "@/server/services/campaigns";

export const metadata: Metadata = { title: "Campanha" };

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-3">
      <p className="text-xs text-fg-3">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-fg-3">{hint}</p> : null}
    </div>
  );
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("campaign:read");
  const { id } = await params;
  const detail = await getCampaignDetail(id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const { campaign: c, progress: p, report: r, recentEvents } = detail;
  const canWrite = can(user.role, "campaign:write");
  const running = c.status === "RUNNING";
  const queued = (r.jobs.QUEUED ?? 0) + (r.jobs.RUNNING ?? 0);

  return (
    <>
      <AutoRefresh active={running} seconds={4} />
      <PageHeader
        breadcrumb={{ href: "/campanhas", label: "Campanhas" }}
        title={c.name}
        description={`${c.nicheLabel} · ${c.city}/${c.state} · criada por ${c.createdBy?.name ?? "—"} em ${formatDateTime(c.createdAt)}`}
        actions={
          <>
            <CampaignStatusBadge status={c.status} />
            {canWrite && running ? (
              <ActionButton action={campaignControlAction.bind(null, c.id, "pause")} size="sm">
                <Pause /> Pausar
              </ActionButton>
            ) : null}
            {canWrite && ["PAUSED", "FAILED"].includes(c.status) ? (
              <ActionButton action={campaignControlAction.bind(null, c.id, "resume")} size="sm" variant="primary">
                <Play /> Retomar
              </ActionButton>
            ) : null}
            {canWrite && !["CANCELLED", "COMPLETED"].includes(c.status) ? (
              <ActionButton
                action={campaignControlAction.bind(null, c.id, "cancel")}
                size="sm"
                variant="ghost"
                confirm={{
                  title: "Cancelar campanha?",
                  description: "As tarefas pendentes e as mensagens ainda não enviadas desta campanha serão canceladas. Os leads já encontrados permanecem no CRM.",
                  confirmLabel: "Cancelar campanha",
                  tone: "danger",
                }}
              >
                <XCircle /> Cancelar
              </ActionButton>
            ) : null}
          </>
        }
      />

      {c.lastError ? (
        <Alert tone={c.status === "PAUSED" ? "warning" : "danger"} className="mb-6" title={c.status === "PAUSED" ? "Campanha pausada automaticamente" : "Atenção"}>
          {c.lastError}
        </Alert>
      ) : null}
      {p.warnings.length ? (
        <Alert tone="warning" className="mb-6" title="Avisos das fontes">
          <ul className="list-disc pl-4">{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Progresso"
            description={running ? (queued ? `${queued} tarefa(s) em andamento — atualizando automaticamente` : "Iniciando…") : undefined}
            action={r.messagesDrafted > 0 ? <ButtonLink href="/mensagens" size="sm" variant="soft">Revisar mensagens</ButtonLink> : null}
          />
          <CardBody className="space-y-5">
            <div>
              <div className="mb-2 flex justify-between text-13">
                <span className="text-fg-2">Empresas na campanha</span>
                <span className="font-medium tabular-nums">{p.linked} / {c.targetCount}</span>
              </div>
              <ProgressBar value={p.linked} max={c.targetCount} label="Empresas encontradas" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Resultados nas fontes" value={p.found} hint={`${p.apiRequests} consulta(s)`} />
              <Metric label="Novas empresas" value={p.created} />
              <Metric label="Já existentes / duplicadas" value={p.duplicates} />
              <Metric label="Fora da cidade" value={p.outsideArea} />
              <Metric label="Mensagens preparadas" value={r.messagesDrafted} />
              <Metric label="Enviadas" value={r.messagesSent} hint={r.messagesFailed ? `${r.messagesFailed} falha(s)` : undefined} />
              <Metric label="Respostas" value={r.replies} hint={`taxa ${formatPercent(r.responseRate)}`} />
              <Metric label="Vendas" value={r.won} hint={formatBRL(r.revenue)} />
            </div>
            <p className="text-xs text-fg-3">
              Fontes: {(c.providers as string[]).map((pr) => PROVIDER_LABELS[pr as keyof typeof PROVIDER_LABELS] ?? pr).join(", ")} · Prioridade mínima:{" "}
              {PRIORITY_LABELS[c.minPriority].label} · {c.onlyWithoutWebsite ? "somente sem site ou com presença fraca" : "todas as empresas"}
              {c.abTestEnabled ? " · teste A/B ativo" : ""}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Verificação de sites" />
          <CardBody>
            <ul className="space-y-2 text-13">
              {Object.entries(r.website).map(([status, count]) => (
                <li key={status} className="flex justify-between">
                  <Link href={`/leads?campaignId=${c.id}&websiteStatus=${status}`} className="text-fg-2 hover:text-accent">
                    {WEBSITE_STATUS_LABELS[status as keyof typeof WEBSITE_STATUS_LABELS]?.label ?? status}
                  </Link>
                  <span className="font-medium tabular-nums">{count}</span>
                </li>
              ))}
              {Object.keys(r.website).length === 0 ? <li className="text-fg-3">Nenhum lead verificado ainda.</li> : null}
            </ul>
            <div className="mt-4 border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-fg-3">Prioridade</p>
              <ul className="space-y-1.5 text-13">
                {(["HIGH", "MEDIUM", "LOW"] as const).map((pr) => (
                  <li key={pr} className="flex justify-between">
                    <span className="text-fg-2">{PRIORITY_LABELS[pr].label}</span>
                    <span className="font-medium tabular-nums">{r.priority[pr] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
            <ButtonLink href={`/leads?campaignId=${c.id}`} size="sm" className="mt-4 w-full">Ver leads da campanha</ButtonLink>
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Registro de execução" description="Eventos e erros desta campanha." />
          <ul className="divide-y divide-border">
            {recentEvents.length === 0 ? <li className="px-5 py-4 text-13 text-fg-3">Sem eventos registrados.</li> : null}
            {recentEvents.map((e) => (
              <li key={e.id} className="flex gap-3 px-5 py-2.5 text-13">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", e.level === "ERROR" ? "bg-danger" : e.level === "WARN" ? "bg-warning" : "bg-fg-3")} aria-hidden />
                <span className="sr-only">{e.level === "ERROR" ? "Erro:" : e.level === "WARN" ? "Aviso:" : ""}</span>
                <span className="min-w-0 flex-1 break-words text-fg-2">{e.message}</span>
                <time className="shrink-0 text-xs text-fg-3">{formatDateTime(e.createdAt)}</time>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
