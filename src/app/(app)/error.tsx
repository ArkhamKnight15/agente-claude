"use client";

import { RotateCcw } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";

export default function ErroDaPagina({ reset }: { error: Error; reset: () => void }) {
  return (
    <Aviso
      tipo="erro"
      titulo="Não foi possível carregar esta tela"
      acao={
        <Botao variante="secundario" tamanho="sm" icone={<RotateCcw aria-hidden />} onClick={reset}>
          Tentar de novo
        </Botao>
      }
    >
      Verifique a conexão. Se continuar, confira se o banco de dados está conectado ao projeto na Vercel.
    </Aviso>
  );
}
