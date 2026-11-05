import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tipo = "info" | "aviso" | "erro" | "sucesso";

const ESTILO: Record<Tipo, { classe: string; Icone: typeof Info }> = {
  info: { classe: "border-info/25 bg-info-soft text-info", Icone: Info },
  aviso: { classe: "border-warning/30 bg-warning-soft text-warning", Icone: TriangleAlert },
  erro: { classe: "border-danger/30 bg-danger-soft text-danger", Icone: CircleAlert },
  sucesso: { classe: "border-success/30 bg-success-soft text-success", Icone: CircleCheck },
};

export function Aviso({ tipo = "info", titulo, children, acao, className }: { tipo?: Tipo; titulo?: string; children?: ReactNode; acao?: ReactNode; className?: string }) {
  const { classe, Icone } = ESTILO[tipo];
  return (
    <div role={tipo === "erro" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-14", classe, className)}>
      <Icone className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {titulo ? <p className="font-semibold">{titulo}</p> : null}
        {children ? <div className="text-fg-2 [&_a]:font-medium [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-2">{children}</div> : null}
        {acao ? <div className="pt-1.5">{acao}</div> : null}
      </div>
    </div>
  );
}
