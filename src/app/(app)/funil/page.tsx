import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { LeadStage } from "@/generated/prisma/enums";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { LOSS_REASON_LABELS, STAGE_LABELS, TASK_TYPE_LABELS } from "@/data/labels";
import { NICHES } from "@/data/niches";
import { formatBRL, formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { can } from "@/server/security/rbac";
import { PipelineBoard } from "./board";

export const metadata: Metadata = { title: "CRM e funil" };

const COLUMNS: LeadStage[] = ["QUALIFIED", "MESSAGE_READY", "CONTACTED", "AWAITING_REPLY", "INTERESTED", "NEGOTIATION", "PROPOSAL_SENT"];

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ niche?: string; state?: string }> }) {
  const user = await requireUser("lead:read");
  const { niche, state } = await searchParams;
  const where = { ...(niche ? { nicheKey: niche } : {}), ...(state ? { state } : {}) };
  const now = new Date();
  const [leads, closed, lossReasons, tasks] = await Promise.all([
    db.lead.findMany({
      where: { ...where, stage: { in: COLUMNS } },
      orderBy: [{ score: { sort: "desc", nulls: "last" } }],
      take: 400,
      include: { tasks: { where: { status: "OPEN" }, orderBy: { dueAt: "asc" }, take: 1 } },
    }),
    db.lead.groupBy({ by: ["stage"], where: { ...where, stage: { in: ["WON", "LOST", "DO_NOT_CONTACT", "FOUND", "VERIFYING"] } }, _count: true, _sum: { dealValue: true } }),
    db.lead.groupBy({ by: ["lossReason"], where: { ...where, stage: "LOST", lossReason: { not: null } }, _count: true }),
    db.followUpTask.findMany({
      where: { status: "OPEN", dueAt: { lte: new Date(now.getTime() + 2 * 86400_000) }, lead: where },
      orderBy: { dueAt: "asc" },
      take: 12,
      include: { lead: { select: { id: true, name: true } } },
    }),
  ]);
  const count = (s: LeadStage) => closed.find((c) => c.stage === s)?._count ?? 0;
  const wonValue = Number(closed.find((c) => c.stage === "WON")?._sum.dealValue ?? 0);

  return (
    <>
      <PageHeader
        title="CRM e funil"
        description="Arraste os cards ou use “Mover para”. Vendas fechadas e perdas são registradas na ficha do lead (com valor ou motivo)."
      />
      <form method="get" className="mb-4 flex flex-wrap gap-2" aria-label="Filtrar funil">
        <select name="niche" defaultValue={niche ?? ""} className="h-9 rounded-lg border border-border bg-surface px-2.5 text-13" aria-label="Nicho">
          <option value="">Todos os nichos</option>
          {NICHES.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
        </select>
        <input name="state" defaultValue={state ?? ""} maxLength={2} placeholder="UF" className="h-9 w-20 rounded-lg border border-border bg-surface px-2.5 text-13 uppercase" aria-label="UF" />
        <button className="h-9 rounded-lg border border-border bg-surface px-3 text-13 font-medium hover:bg-surface-2">Filtrar</button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Encontradas / em verificação", count("FOUND") + count("VERIFYING"), "/leads?stage=FOUND"],
          ["Vendas fechadas", `${count("WON")} · ${formatBRL(wonValue)}`, "/leads?stage=WON"],
          ["Sem interesse", count("LOST"), "/leads?stage=LOST"],
          ["Não contatar", count("DO_NOT_CONTACT"), "/leads?stage=DO_NOT_CONTACT"],
          ["Principais motivos de perda", lossReasons.sort((a, b) => b._count - a._count).slice(0, 2).map((r) => `${LOSS_REASON_LABELS[r.lossReason!]} (${r._count})`).join(", ") || "—", "/relatorios"],
        ].map(([label, value, href]) => (
          <Link key={label as string} href={href as string} className="rounded-xl border border-border bg-surface p-3 shadow-xs hover:border-border-strong">
            <p className="text-xs text-fg-3">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold">{value}</p>
          </Link>
        ))}
      </div>

      <PipelineBoard
        columns={COLUMNS}
        canMove={can(user.role, "lead:write")}
        cards={leads.map((l) => ({
          id: l.id, name: l.name, city: l.city, state: l.state, stage: l.stage, priority: l.priority, score: l.score, isDemo: l.isDemo,
          nextTask: l.tasks[0] ? `${l.tasks[0].title} · ${formatDate(l.tasks[0].dueAt)}` : null,
          overdue: Boolean(l.tasks[0] && l.tasks[0].dueAt < now),
        }))}
      />

      <Card className="mt-6">
        <CardHeader title="Próximos passos (até 2 dias)" description="Sugeridos pelo agente ou agendados pela equipe." />
        <ul className="divide-y divide-border">
          {tasks.length === 0 ? <li className="px-5 py-4 text-13 text-fg-3">Nada pendente para os próximos dias.</li> : null}
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-13">
              <CalendarClock className={t.dueAt < now ? "size-4 text-danger" : "size-4 text-fg-3"} aria-hidden />
              <Link href={`/leads/${t.lead.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                <span className="font-medium">{t.title}</span> <span className="text-fg-3">· {t.lead.name}</span>
              </Link>
              <span className="shrink-0 text-xs text-fg-3">{TASK_TYPE_LABELS[t.type]} · {formatDate(t.dueAt)}{t.dueAt < now ? " (atrasado)" : ""}</span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-3 text-xs text-fg-3">Etapas: {COLUMNS.map((s) => STAGE_LABELS[s].label).join(" → ")}.</p>
    </>
  );
}
