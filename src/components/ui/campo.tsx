import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const base =
  "w-full rounded-lg border border-border-strong bg-surface text-[16px] text-fg shadow-sm transition-[border-color,box-shadow] duration-150 placeholder:text-fg-3 " +
  "hover:border-fg-3 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20 disabled:opacity-60 aria-invalid:border-danger sm:text-14";

interface CampoProps {
  id: string;
  rotulo: string;
  dica?: ReactNode;
  erro?: string;
  children: ReactNode;
  className?: string;
}

/** Rótulo + controle + dica/erro, com os ids ligados para leitores de tela. */
export function Campo({ id, rotulo, dica, erro, children, className }: CampoProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-13 font-medium text-fg-2">
        {rotulo}
      </label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="text-13 text-danger">
          {erro}
        </p>
      ) : dica ? (
        <p id={`${id}-dica`} className="text-12 text-fg-3">
          {dica}
        </p>
      ) : null}
    </div>
  );
}

export function descritoPor(id: string, erro?: string, dica?: unknown): string | undefined {
  return erro ? `${id}-erro` : dica ? `${id}-dica` : undefined;
}

export function Entrada({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(base, "h-11 px-3 sm:h-10", className)} {...props} />;
}

export function Selecao({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(base, "h-11 appearance-none pr-9 pl-3 sm:h-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
    </div>
  );
}

export function AreaTexto({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(base, "px-3 py-2.5 leading-relaxed", className)} {...props} />;
}
