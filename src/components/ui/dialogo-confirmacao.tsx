"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Botao } from "./botao";

interface Props {
  aberto: boolean;
  titulo: string;
  children: ReactNode;
  confirmar: string;
  icone?: ReactNode;
  carregando?: boolean;
  aoConfirmar: () => void;
  aoFechar: () => void;
}

/**
 * Confirmação de ação destrutiva com <dialog> nativo: prende o foco, fecha com Esc ou clique
 * fora e devolve o foco ao botão que abriu. O botão seguro (Cancelar) recebe o foco primeiro.
 */
export function DialogoConfirmacao({ aberto, titulo, children, confirmar, icone, carregando, aoConfirmar, aoFechar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    // O clique no fundo (fora do conteúdo) fecha; o teclado já fecha com Esc pelo próprio <dialog>.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-texto`}
      onClose={aoFechar}
      onClick={(e) => e.target === e.currentTarget && aoFechar()}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-surface p-0 text-fg shadow-md backdrop:bg-black/50 backdrop:backdrop-blur-[2px] open:animate-entrar"
    >
      <div className="p-5">
        {icone ? <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-danger-soft text-danger [&_svg]:size-5">{icone}</div> : null}
        <h2 id={`${id}-titulo`} className="text-18 font-semibold">
          {titulo}
        </h2>
        <div id={`${id}-texto`} className="mt-1.5 text-14 text-fg-2">
          {children}
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Botao variante="secundario" onClick={aoFechar} autoFocus>
            Cancelar
          </Botao>
          <Botao variante="perigo-solido" carregando={carregando} onClick={aoConfirmar} icone={icone}>
            {confirmar}
          </Botao>
        </div>
      </div>
    </dialog>
  );
}
