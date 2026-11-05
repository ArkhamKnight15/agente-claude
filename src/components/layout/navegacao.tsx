"use client";

import { LogOut, MessageSquareText, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { sairAcao } from "@/server/acoes";

const ITENS = [
  { href: "/", rotulo: "Buscar", Icone: Search },
  { href: "/contatos", rotulo: "Contatos", Icone: Users },
  { href: "/mensagem", rotulo: "Mensagem", Icone: MessageSquareText },
];

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Marca() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-13 font-bold text-accent-fg" aria-hidden>
        P
      </span>
      Prospecta
    </span>
  );
}

/** Abas no topo (computador) e barra inferior (celular). */
export function Navegacao() {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="rounded-md" aria-label="Prospecta — início">
            <Marca />
          </Link>
          <nav aria-label="Principal" className="hidden h-full items-stretch gap-1 sm:flex">
            {ITENS.map(({ href, rotulo, Icone }) => (
              <Link
                key={href}
                href={href}
                aria-current={ativo(pathname, href) ? "page" : undefined}
                className={cn(
                  "relative inline-flex items-center gap-2 px-3 text-14 font-medium text-fg-3 transition-colors hover:text-fg",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent aria-[current=page]:text-fg aria-[current=page]:after:bg-accent",
                )}
              >
                <Icone className="size-4" aria-hidden />
                {rotulo}
              </Link>
            ))}
          </nav>
          <form action={sairAcao} className="ml-auto">
            <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-13 font-medium text-fg-3 hover:bg-surface-2 hover:text-fg">
              <LogOut className="size-4" aria-hidden />
              <span>Sair</span>
            </button>
          </form>
        </div>
      </header>

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <ul className="grid grid-cols-3">
          {ITENS.map(({ href, rotulo, Icone }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={ativo(pathname, href) ? "page" : undefined}
                className="flex h-16 flex-col items-center justify-center gap-1 text-12 font-medium text-fg-3 aria-[current=page]:text-accent"
              >
                <Icone className="size-5" aria-hidden />
                {rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
