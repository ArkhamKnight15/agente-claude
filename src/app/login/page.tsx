import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const highlights = [
  "Encontra empresas sem site próprio por nicho e cidade",
  "Verifica a presença digital com evidências registradas",
  "Prepara abordagens personalizadas para sua aprovação",
  "Acompanha respostas, propostas e vendas em um CRM",
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <section className="relative hidden overflow-hidden border-r border-border bg-surface-2 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg" aria-hidden>
            <svg viewBox="0 0 32 32" className="size-4.5">
              <path d="M10 22V10h6.2a4.3 4.3 0 0 1 0 8.6H10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-base font-semibold tracking-tight">Prospecta</span>
        </div>
        <div className="max-w-lg">
          <p className="text-13 font-medium text-accent">Agente comercial de IA</p>
          <h2 className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-balance">
            Menos tempo pesquisando empresas. Mais tempo fechando sites.
          </h2>
          <ul className="mt-8 space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-fg-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-fg-3">Envios só acontecem com sua aprovação e pelas integrações oficiais.</p>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-accent/10 blur-3xl"
        />
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg" aria-hidden>
              <svg viewBox="0 0 32 32" className="size-4.5">
                <path d="M10 22V10h6.2a4.3 4.3 0 0 1 0 8.6H10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-base font-semibold tracking-tight">Prospecta</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
          <p className="mt-1.5 text-sm text-fg-3">Use o e-mail e a senha cadastrados pelo administrador.</p>
          <LoginForm next={next} />
        </div>
      </section>
    </main>
  );
}
