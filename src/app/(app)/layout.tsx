import { redirect } from "next/navigation";
import { ConfiguracaoPendente } from "@/components/layout/configuracao-pendente";
import { Navegacao } from "@/components/layout/navegacao";
import { estaLogado } from "@/server/auth";
import { problemasDeConfiguracao } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const problemas = problemasDeConfiguracao();
  if (problemas.length) return <ConfiguracaoPendente problemas={problemas} />;
  if (!(await estaLogado())) redirect("/login");

  return (
    <>
      <Navegacao />
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 sm:px-6 sm:pt-10 sm:pb-16">{children}</main>
    </>
  );
}
