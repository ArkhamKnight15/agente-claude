"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bot,
  Briefcase,
  Database,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  Plug,
  Search,
  Sun,
  Monitor,
  Tags,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavGroup, NavIcon } from "./nav-config";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  campaigns: Megaphone,
  search: Search,
  leads: Briefcase,
  pipeline: KanbanSquare,
  messages: MessageSquare,
  proposals: FileText,
  reports: BarChart3,
  tasks: ListChecks,
  integrations: Plug,
  pricing: Tags,
  agent: Bot,
  users: Users,
  data: Database,
};

export interface ShellProps {
  nav: NavGroup[];
  badges: Partial<Record<"review" | "tasks" | "failedJobs", number>>;
  user: { name: string; email: string; roleLabel: string };
  worker: { online: boolean; lastSeen: string | null };
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
  banner?: React.ReactNode;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      /* armazenamento indisponível: segue o sistema */
    }
  }, []);
  const apply = (next: typeof theme) => {
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignora */
    }
    const dark = next === "dark" || (next === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  };
  const options = [
    { key: "light" as const, label: "Tema claro", icon: Sun },
    { key: "system" as const, label: "Tema do sistema", icon: Monitor },
    { key: "dark" as const, label: "Tema escuro", icon: Moon },
  ];
  return (
    <div className="flex rounded-lg border border-border bg-surface-2 p-0.5" role="radiogroup" aria-label="Tema">
      {options.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={theme === key}
          aria-label={label}
          title={label}
          onClick={() => apply(key)}
          className={cn(
            "grid h-6 flex-1 place-items-center rounded-md text-fg-3 transition-colors hover:text-fg",
            theme === key && "bg-surface text-fg shadow-xs",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function SidebarContent({ nav, badges, user, worker, logoutAction, onNavigate }: Omit<ShellProps, "children" | "banner"> & { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-5">
        <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-fg" aria-hidden>
          <svg viewBox="0 0 32 32" className="size-4">
            <path d="M10 22V10h6.2a4.3 4.3 0 0 1 0 8.6H10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Prospecta</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Navegação principal">
        {nav.map((group) => (
          <div key={group.label} className="mt-4 first:mt-1">
            <p className="px-2 pb-1.5 text-2xs font-medium tracking-wide text-fg-3 uppercase">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = isActive(pathname, item.href);
                const count = item.badgeKey ? badges[item.badgeKey] : undefined;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex h-8 items-center gap-2.5 rounded-lg px-2 text-13 font-medium transition-colors",
                        active ? "bg-surface text-fg shadow-xs ring-1 ring-border" : "text-fg-2 hover:bg-surface-3/60 hover:text-fg",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-fg-3 group-hover:text-fg-2")} />
                      <span className="truncate">{item.label}</span>
                      {count ? (
                        <span
                          className={cn(
                            "ml-auto rounded-full px-1.5 text-2xs leading-4 font-semibold tabular-nums",
                            item.badgeKey === "failedJobs" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-soft-fg",
                          )}
                          aria-label={`${count} pendente(s)`}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-border p-3">
        <Link
          href="/tarefas"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-fg-3 transition-colors hover:bg-surface-3/60 hover:text-fg"
          title={worker.lastSeen ? `Último sinal: ${worker.lastSeen}` : "Nenhum worker registrado"}
        >
          <span className={cn("size-2 rounded-full", worker.online ? "bg-success" : "bg-danger")} aria-hidden />
          {worker.online ? "Automação ativa (worker online)" : "Worker offline — tarefas pausadas"}
        </Link>
        <ThemeToggle />
        <div className="flex items-center gap-2.5 px-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-fg-2" aria-hidden>
            {user.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-13 font-medium">{user.name}</p>
            <p className="truncate text-xs text-fg-3">{user.roleLabel}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md p-1.5 text-fg-3 transition-colors hover:bg-surface-3 hover:text-fg"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children, banner, ...props }: ShellProps) {
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const d = drawer.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#conteudo" className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Pular para o conteúdo
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-surface-2 lg:block">
        <SidebarContent {...props} />
      </aside>

      <dialog
        ref={drawer}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === drawer.current && setOpen(false)}
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-r border-border bg-surface-2 p-0 text-fg open:animate-slide-in-left lg:hidden"
        aria-label="Menu"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 z-10 rounded-md p-1.5 text-fg-3 hover:bg-surface-3 hover:text-fg"
          aria-label="Fechar menu"
        >
          <X className="size-4" />
        </button>
        <SidebarContent {...props} onNavigate={() => setOpen(false)} />
      </dialog>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-ml-1 rounded-md p-1.5 text-fg-2 hover:bg-surface-2 lg:hidden"
          aria-label="Abrir menu"
          aria-expanded={open}
        >
          <Menu className="size-5" />
        </button>
        <form
          role="search"
          className="relative w-full max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/leads?q=${encodeURIComponent(query)}`);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <label htmlFor="global-search" className="sr-only">
            Buscar lead por nome ou telefone
          </label>
          <input
            id="global-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar lead por nome ou telefone…"
            className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-sm shadow-xs placeholder:text-fg-3 focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
          />
        </form>
      </header>

      {banner}
      <main id="conteudo" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
