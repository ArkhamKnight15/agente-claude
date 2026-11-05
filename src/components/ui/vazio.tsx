import type { ReactNode } from "react";

export function Vazio({ icone, titulo, children, acao }: { icone: ReactNode; titulo: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-surface-2 text-fg-3 [&_svg]:size-5">{icone}</div>
      <h2 className="text-15 font-semibold">{titulo}</h2>
      {children ? <p className="mt-1.5 max-w-sm text-14 text-fg-3">{children}</p> : null}
      {acao ? <div className="mt-5">{acao}</div> : null}
    </div>
  );
}
