import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? (
          <Link
            href={breadcrumb.href}
            className="mb-2 inline-flex items-center gap-1 text-13 text-fg-3 transition-colors hover:text-fg"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            {breadcrumb.label}
          </Link>
        ) : null}
        <h1 className="text-[1.375rem] leading-tight font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-fg-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

const alertTones = {
  info: { box: "border-info/25 bg-info-soft text-info", icon: Info },
  success: { box: "border-success/25 bg-success-soft text-success", icon: CheckCircle2 },
  warning: { box: "border-warning/30 bg-warning-soft text-warning", icon: AlertTriangle },
  danger: { box: "border-danger/25 bg-danger-soft text-danger", icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof alertTones;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = alertTones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3", box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-13 leading-relaxed">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn("text-fg-2", title && "mt-0.5")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {Icon ? (
        <div className="mb-4 grid size-11 place-items-center rounded-xl border border-border bg-surface-2 text-fg-3">
          <Icon className="size-5" />
        </div>
      ) : null}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-13 text-fg-3">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  hrefFor,
  label = "registros",
}: {
  page: number;
  pageCount: number;
  total: number;
  hrefFor: (page: number) => string;
  label?: string;
}) {
  if (total === 0) return null;
  const link = "inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-13 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg";
  const disabled = "pointer-events-none opacity-40";
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-border px-5 py-3" aria-label="Paginação">
      <p className="text-13 text-fg-3">
        {total.toLocaleString("pt-BR")} {label} · página {page} de {pageCount}
      </p>
      <div className="flex gap-2">
        <Link href={hrefFor(page - 1)} className={cn(link, page <= 1 && disabled)} aria-disabled={page <= 1} rel="prev">
          <ChevronLeft className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Anterior</span>
        </Link>
        <Link href={hrefFor(page + 1)} className={cn(link, page >= pageCount && disabled)} aria-disabled={page >= pageCount} rel="next">
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </nav>
  );
}

export function Tabs({ items, current }: { items: Array<{ key: string; label: string; href: string; count?: number }>; current: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <nav className="flex min-w-max gap-1 border-b border-border" aria-label="Seções">
        {items.map((item) => {
          const active = item.key === current;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative -mb-px flex h-10 items-center gap-2 border-b-2 px-3 text-13 font-medium transition-colors",
                active ? "border-accent text-fg" : "border-transparent text-fg-3 hover:text-fg",
              )}
            >
              {item.label}
              {item.count !== undefined && item.count > 0 ? (
                <span className={cn("rounded-full px-1.5 text-2xs tabular-nums", active ? "bg-accent-soft text-accent-soft-fg" : "bg-surface-3 text-fg-2")}>
                  {item.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function KeyValue({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-fg">{children}</dd>
    </div>
  );
}

export function NotFound({ children }: { children?: React.ReactNode }) {
  return <span className="text-fg-3 italic">{children ?? "não encontrado"}</span>;
}

export function ProgressBar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={className}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
