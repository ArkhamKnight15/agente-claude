import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfiguracaoPendente } from "@/components/layout/configuracao-pendente";
import { Marca } from "@/components/layout/navegacao";
import { estaLogado } from "@/server/auth";
import { problemasDeConfiguracao } from "@/server/env";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ destino?: string }> }) {
  const problemas = problemasDeConfiguracao();
  if (problemas.length) return <ConfiguracaoPendente problemas={problemas} />;
  if (await estaLogado()) redirect("/");
  const { destino } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <Marca />
      <h1 className="mt-10 text-28 font-semibold tracking-tight">Entrar</h1>
      <p className="mt-2 text-14 text-fg-3">Digite a senha de acesso. Você só precisa fazer isso uma vez em cada aparelho.</p>
      <FormularioLogin destino={destino?.startsWith("/") ? destino : "/"} />
    </main>
  );
}
