import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { NAV } from "@/components/layout/nav-config";
import { ROLE_LABELS } from "@/data/labels";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { logoutAction } from "@/server/actions/auth";
import { db } from "@/server/db";
import { can } from "@/server/security/rbac";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [review, tasks, failedJobs, heartbeat, demoLeads] = await Promise.all([
    db.message.count({ where: { direction: "OUTBOUND", status: "PENDING_APPROVAL" } }),
    db.followUpTask.count({ where: { status: "OPEN", dueAt: { lte: new Date() } } }),
    db.job.count({ where: { status: "FAILED", updatedAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }),
    db.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" } }),
    db.lead.count({ where: { isDemo: true } }),
  ]);

  const nav = NAV.map((group) => ({ ...group, items: group.items.filter((item) => can(user.role, item.permission)) })).filter(
    (group) => group.items.length > 0,
  );
  const online = Boolean(heartbeat && Date.now() - heartbeat.lastSeenAt.getTime() < 60_000);

  return (
    <AppShell
      nav={nav}
      badges={{ review, tasks, failedJobs }}
      user={{ name: user.name, email: user.email, roleLabel: ROLE_LABELS[user.role].label }}
      worker={{ online, lastSeen: heartbeat ? formatDateTime(heartbeat.lastSeenAt) : null }}
      logoutAction={logoutAction}
      banner={
        demoLeads > 0 ? (
          <div className="border-b border-warning/30 bg-warning-soft">
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-13 text-warning sm:px-6 lg:px-8">
              <FlaskConical className="size-4 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold">Modo demonstração:</strong> há {demoLeads} leads fictícios marcados como
                “demonstração”. Os números do painel os incluem.
              </span>
              {can(user.role, "settings:write") ? (
                <Link href="/configuracoes/dados" className="font-medium underline underline-offset-2">
                  Remover dados de demonstração
                </Link>
              ) : null}
            </div>
          </div>
        ) : null
      }
    >
      {children}
    </AppShell>
  );
}
