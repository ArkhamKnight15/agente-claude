"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Notificacao {
  id: number;
  texto: string;
  tipo: "sucesso" | "erro";
}

const Contexto = createContext<(texto: string, tipo?: Notificacao["tipo"]) => void>(() => {});

/** Feedback curto de cada ação ("Marcado como enviado"), anunciado a leitores de tela. */
export function ProvedorNotificacoes({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Notificacao[]>([]);
  const proximo = useRef(1);

  const fechar = useCallback((id: number) => setItens((atual) => atual.filter((n) => n.id !== id)), []);
  const notificar = useCallback(
    (texto: string, tipo: Notificacao["tipo"] = "sucesso") => {
      const id = proximo.current++;
      setItens((atual) => [...atual.slice(-2), { id, texto, tipo }]);
      setTimeout(() => fechar(id), tipo === "erro" ? 6000 : 3500);
    },
    [fechar],
  );
  const valor = useMemo(() => notificar, [notificar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {itens.map((n) => (
          <div
            key={n.id}
            role={n.tipo === "erro" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm animate-entrar items-start gap-2.5 rounded-xl border bg-surface px-3.5 py-3 text-14 shadow-md",
              n.tipo === "erro" ? "border-danger/40" : "border-border",
            )}
          >
            {n.tipo === "erro" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />}
            <p className="flex-1">{n.texto}</p>
            <button type="button" onClick={() => fechar(n.id)} className="-m-1 rounded p-1 text-fg-3 hover:text-fg" aria-label="Fechar aviso">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useNotificar() {
  return useContext(Contexto);
}
