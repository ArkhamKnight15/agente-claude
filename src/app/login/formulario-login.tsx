"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import { useActionState, useState } from "react";
import { Botao } from "@/components/ui/botao";
import { Campo, Entrada } from "@/components/ui/campo";
import { entrarAcao, type EstadoLogin } from "@/server/acoes";

export function FormularioLogin({ destino }: { destino: string }) {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(entrarAcao, {});
  const [visivel, setVisivel] = useState(false);

  return (
    <form action={acao} className="mt-8 space-y-5">
      <input type="hidden" name="destino" value={destino} />
      <Campo id="senha" rotulo="Senha" erro={estado.erro}>
        <div className="relative">
          <Entrada
            id="senha"
            name="senha"
            type={visivel ? "text" : "password"}
            autoComplete="current-password"
            required
            autoFocus
            className="pr-11"
            aria-invalid={Boolean(estado.erro) || undefined}
            aria-describedby={estado.erro ? "senha-erro" : undefined}
          />
          <button
            type="button"
            onClick={() => setVisivel((v) => !v)}
            className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-fg-3 hover:text-fg"
            aria-label={visivel ? "Esconder senha" : "Mostrar senha"}
            aria-pressed={visivel}
          >
            {visivel ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </Campo>
      <Botao type="submit" variante="primario" tamanho="lg" carregando={enviando} icone={<LogIn aria-hidden />} className="w-full">
        Entrar
      </Botao>
    </form>
  );
}
