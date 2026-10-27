import type { Metadata } from "next";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { JobStatus } from "@/generated/prisma/enums";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader, Pagination, Tabs } from "@/components/ui/misc";
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS } from "@/data/labels";
import { formatDateTime, formatRelative } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { retryJobAction } from "@/server/actions/admin";
import { db } from "@/server/db";
import { can } from "@/server/security/rbac";
import { isWorkerOnline } from "@/server/jobs/scheduler";

export const metadata: Metadata = { title: "Tarefas e erros" };
const PAGE = 30;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; page?: string }> }) {
  const user = await requireUser("campaign:read");
  const sp = await searchParams;
  const tab = sp.tab === "events" || (sp.tab === "audit" && can(user.role, "audit:read")) ? sp.tab : "jobs";
  const status = Object.values(JobStatus).includes(sp.status as JobStatus) ? (sp.status as JobStatus) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [workers, counts] = await Promise.all([
    db.workerHeartbeat.findMany({ orderBy: { lastSeenAt: "desc" }, take: 5 }),
    db.job.groupBy({ by: ["status"], _count: true }),
  ]);
  const online = workers.filter((w) => isWorkerOnline(w));
  const queued = counts.find((c) => c.status === "QUEUED")?._count ?? 0;
  const running = counts.find((c) => c.status === "RUNNING")?._count ?? 0;

  return (
    <>
      <AutoRefresh active={tab === "jobs" && running + queued > 0} seconds={5} />
      <PageHeader title="Histórico de tarefas e erros" description="Tudo o que o sistema executou, o que falhou e o que ainda está na fila." />
      {online.length === 0 ? (
        <Alert tone={queued ? "danger" : "warning"} className="mb-4" title="Worker offline">
          As automações (pesquisas, verificações, envios e leitura de respostas) precisam do worker (<code className="font-mono text-xs">npm run worker</code>) ou, na Vercel, do agendamento de <code className="font-mono text-xs">/api/cron/run-jobs</code> (veja o README).
          {queued ? ` Há ${queued} tarefa(s) aguardando.` : ""}
        </Alert>
      ) : (
        <Alert tone="success" className="mb-4" title={`${online.length} worker(s) online`}>
          {online.map((w) => `${w.id.startsWith("cron:") ? `execução agendada (${w.hostname})` : w.hostname} · ${w.jobsDone} tarefa(s) desde ${formatDateTime(w.startedAt)} · último sinal ${formatDateTime(w.lastSeenAt)}`).join(" · ")}
        </Alert>
      )}
      <Tabs current={tab} items={[
        { key: "jobs", label: "Tarefas", href: "/tarefas", count: (counts.find((c) => c.status === "FAILED")?._count ?? 0) },
        { key: "events", label: "Eventos e erros", href: "/tarefas?tab=events" },
        ...(can(user.role, "audit:read") ? [{ key: "audit", label: "Auditoria", href: "/tarefas?tab=audit" }] : []),
      ]} />
      <div className="mt-4">
        {tab === "jobs" ? <Jobs status={status} page={page} canRetry={can(user.role, "campaign:write")} counts={counts} /> : tab === "events" ? <Events page={page} /> : <Audit page={page} />}
      </div>
    </>
  );
}

async function Jobs({ status, page, canRetry, counts }: { status?: JobStatus; page: number; canRetry: boolean; counts: Array<{ status: JobStatus; _count: number }> }) {
  const where = status ? { status } : {};
  const [total, jobs] = await Promise.all([
    db.job.count({ where }),
    db.job.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { campaign: { select: { id: true, name: true } } } }),
  ]);
  return (
    <Card>
      <nav className="flex flex-wrap gap-2 border-b border-border p-3 text-13" aria-label="Filtrar status">
        <Link href="/tarefas" className={!status ? "rounded-full bg-fg px-3 py-1 font-medium text-bg" : "rounded-full border border-border px-3 py-1 text-fg-2"}>Todas</Link>
        {Object.values(JobStatus).map((s) => (
          <Link key={s} href={`/tarefas?status=${s}`} className={status === s ? "rounded-full bg-fg px-3 py-1 font-medium text-bg" : "rounded-full border border-border px-3 py-1 text-fg-2"}>
            {JOB_STATUS_LABELS[s].label} ({counts.find((c) => c.status === s)?._count ?? 0})
          </Link>
        ))}
      </nav>
      {jobs.length === 0 ? <EmptyState title="Nenhuma tarefa" description="As tarefas aparecem aqui quando campanhas, verificações ou envios são executados." /> : (
        <>
          <TableContainer>
            <Table>
              <THead><tr><Th>Tarefa</Th><Th>Status</Th><Th>Tentativas</Th><Th>Contexto</Th><Th>Atualizada</Th><Th><span className="sr-only">Ações</span></Th></tr></THead>
              <TBody>
                {jobs.map((j) => (
                  <Tr key={j.id}>
                    <Td className="max-w-md">
                      <p className="font-medium">{JOB_TYPE_LABELS[j.type] ?? j.type}</p>
                      {j.lastError ? <p className={j.status === "FAILED" ? "mt-0.5 text-xs break-words text-danger" : "mt-0.5 text-xs break-words text-fg-3"}>{j.lastError}</p> : null}
                    </Td>
                    <Td><Badge tone={JOB_STATUS_LABELS[j.status].tone} dot>{JOB_STATUS_LABELS[j.status].label}</Badge></Td>
                    <Td className="tabular-nums">{j.attempts}/{j.maxAttempts}</Td>
                    <Td className="text-xs">
                      {j.campaign ? <Link href={`/campanhas/${j.campaign.id}`} className="block text-accent hover:underline">{j.campaign.name}</Link> : null}
                      {j.leadId ? <Link href={`/leads/${j.leadId}`} className="text-accent hover:underline">ver lead</Link> : null}
                      {j.status === "QUEUED" && j.runAt > new Date() ? <span className="block text-fg-3">agendada {formatRelative(j.runAt)}</span> : null}
                    </Td>
                    <Td className="whitespace-nowrap text-fg-3">{formatDateTime(j.updatedAt)}</Td>
                    <Td className="text-right">{j.status === "FAILED" && canRetry ? <ActionButton size="xs" action={retryJobAction.bind(null, j.id)}><RotateCcw /> Tentar de novo</ActionButton> : null}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableContainer>
          <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE))} total={total} hrefFor={(p) => `/tarefas?${new URLSearchParams({ ...(status ? { status } : {}), page: String(p) })}`} label="tarefas" />
        </>
      )}
    </Card>
  );
}

async function Events({ page }: { page: number }) {
  const [total, events] = await Promise.all([db.eventLog.count(), db.eventLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE })]);
  const tone = { ERROR: "danger", WARN: "warning", INFO: "info", DEBUG: "neutral" } as const;
  const label = { ERROR: "Erro", WARN: "Aviso", INFO: "Info", DEBUG: "Debug" } as const;
  return (
    <Card>
      {events.length === 0 ? <EmptyState title="Nenhum evento registrado" /> : (
        <>
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3 text-13">
                <Badge tone={tone[e.level]} className="shrink-0">{label[e.level]}</Badge>
                <span className="font-mono text-xs text-fg-3">{e.source}</span>
                <span className="min-w-0 flex-1 basis-64 break-words text-fg-2">{e.message}</span>
                <span className="shrink-0 text-xs text-fg-3">
                  {e.campaignId ? <Link href={`/campanhas/${e.campaignId}`} className="mr-2 text-accent hover:underline">campanha</Link> : null}
                  {e.leadId ? <Link href={`/leads/${e.leadId}`} className="mr-2 text-accent hover:underline">lead</Link> : null}
                  {formatDateTime(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE))} total={total} hrefFor={(p) => `/tarefas?tab=events&page=${p}`} label="eventos" />
        </>
      )}
    </Card>
  );
}

async function Audit({ page }: { page: number }) {
  const [total, logs] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { user: { select: { name: true } } } }),
  ]);
  return (
    <Card>
      <TableContainer>
        <Table>
          <THead><tr><Th>Ação</Th><Th>Usuário</Th><Th>Registro</Th><Th>IP</Th><Th>Quando</Th></tr></THead>
          <TBody>
            {logs.map((l) => (
              <Tr key={l.id}>
                <Td className="font-mono text-xs">{l.action}</Td>
                <Td>{l.user?.name ?? <span className="text-fg-3">sistema</span>}</Td>
                <Td className="text-xs text-fg-3">{l.entityType ? `${l.entityType} ${l.entityId?.slice(-8) ?? ""}` : "—"}</Td>
                <Td className="text-xs text-fg-3">{l.ip ?? "—"}</Td>
                <Td className="whitespace-nowrap text-fg-3">{formatDateTime(l.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableContainer>
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE))} total={total} hrefFor={(p) => `/tarefas?tab=audit&page=${p}`} label="registros" />
    </Card>
  );
}
