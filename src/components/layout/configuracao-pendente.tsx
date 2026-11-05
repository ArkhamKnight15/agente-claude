import { Settings } from "lucide-react";
import { Marca } from "./navegacao";

const AJUDA: Record<string, string> = {
  DATABASE_URL:
    "Na Vercel: Storage → conecte o banco Neon a este projeto, marcando Production, Preview e Development. Se o banco já aparece conectado, confira em Settings → Environment Variables se DATABASE_URL vale para Production.",
  APP_PASSWORD: "Settings → Environment Variables → APP_PASSWORD com a senha de acesso (mínimo 8 caracteres).",
};

/** Tela mostrada quando falta alguma variável obrigatória — diz exatamente o que fazer. */
export function ConfiguracaoPendente({ problemas }: { problemas: string[] }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <Marca />
      <div className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-warning-soft text-warning">
          <Settings className="size-5" aria-hidden />
        </div>
        <h1 className="text-22 font-semibold">Falta pouco para começar</h1>
        <p className="mt-2 text-14 text-fg-2">Configure estas variáveis no projeto da Vercel e faça um Redeploy:</p>
        <ul className="mt-4 space-y-3">
          {problemas.map((p) => {
            const nome = p.split(" ")[0];
            return (
              <li key={p} className="rounded-xl bg-surface-2 px-4 py-3 text-14">
                <code className="font-mono text-13 font-semibold">{nome}</code>
                <span className="text-fg-3"> — {p.slice(nome.length + 1)}</span>
                {AJUDA[nome] ? <p className="mt-1 text-13 text-fg-2">{AJUDA[nome]}</p> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
