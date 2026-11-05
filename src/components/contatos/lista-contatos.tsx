"use client";

import { Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CartaoContato } from "@/components/contatos/cartao-contato";
import { Entrada } from "@/components/ui/campo";
import { Vazio } from "@/components/ui/vazio";
import { ORDEM_STATUS, STATUS } from "@/data/status";
import { cn } from "@/lib/cn";
import type { ConfigMensagem, Contato, ContatoStatus } from "@/types";

interface Props {
  contatos: Contato[];
  contagem: Record<ContatoStatus, number> & { total: number };
  config: ConfigMensagem;
  status?: ContatoStatus;
  busca: string;
}

export function ListaContatos({ contatos, contagem, config, status, busca }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [texto, setTexto] = useState(busca);
  const [, iniciar] = useTransition();

  // Busca por texto com atraso curto, sem recarregar a página a cada tecla.
  useEffect(() => {
    if (texto === busca) return;
    const timer = setTimeout(() => {
      const novos = new URLSearchParams(params.toString());
      if (texto.trim()) novos.set("q", texto.trim());
      else novos.delete("q");
      iniciar(() => router.replace(`${pathname}?${novos.toString()}`, { scroll: false }));
    }, 300);
    return () => clearTimeout(timer);
  }, [texto, busca, params, pathname, router]);

  function linkStatus(s?: ContatoStatus) {
    const novos = new URLSearchParams(params.toString());
    if (s) novos.set("status", s);
    else novos.delete("status");
    const qs = novos.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const filtros: Array<{ valor?: ContatoStatus; rotulo: string; n: number }> = [
    { rotulo: "Todos", n: contagem.total },
    ...ORDEM_STATUS.map((s) => ({ valor: s, rotulo: STATUS[s].rotulo, n: contagem[s] })),
  ];

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
        <label htmlFor="busca-contatos" className="sr-only">
          Buscar por nome, cidade ou telefone
        </label>
        <Entrada id="busca-contatos" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nome, cidade ou telefone" className="pl-9" />
      </div>

      <nav aria-label="Filtrar por andamento" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {filtros.map((f) => {
            const atual = f.valor === status;
            return (
              <li key={f.rotulo}>
                <Link
                  href={linkStatus(f.valor)}
                  scroll={false}
                  aria-current={atual ? "true" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-13 font-medium whitespace-nowrap transition-colors",
                    atual ? "border-fg bg-fg text-bg" : "border-border-strong bg-surface text-fg-2 hover:border-fg-3 hover:text-fg",
                  )}
                >
                  {f.rotulo}
                  <span className={cn("tabular-nums", atual ? "text-bg/70" : "text-fg-3")}>{f.n}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {contatos.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {contatos.map((c) => (
            <li key={`${c.id}:${c.atualizadoEm}`}>
              <CartaoContato contato={c} config={config} comObservacao />
            </li>
          ))}
        </ul>
      ) : contagem.total === 0 ? (
        <Vazio
          icone={<Users />}
          titulo="Nenhum contato ainda"
          acao={
            <Link href="/" className="text-14 font-medium text-accent hover:underline">
              Fazer a primeira busca
            </Link>
          }
        >
          As empresas que você encontrar na busca aparecem aqui, com o andamento de cada uma.
        </Vazio>
      ) : (
        <Vazio icone={<Search />} titulo="Nada encontrado">
          Nenhum contato com esse filtro. Tente outro nome ou outro andamento.
        </Vazio>
      )}
    </div>
  );
}
