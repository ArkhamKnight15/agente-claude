import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PainelImportacao } from "@/components/importacao/painel-importacao";
import { Cabecalho } from "@/components/layout/cabecalho";
import { lerConfig } from "@/server/config";

export const metadata: Metadata = { title: "Importar empresas" };

export default async function ImportarPage() {
  const config = await lerConfig();
  return (
    <>
      <Link href="/contatos" className="mb-4 inline-flex items-center gap-1.5 rounded-md text-13 font-medium text-fg-3 hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        Contatos
      </Link>
      <Cabecalho
        titulo="Importar empresas"
        descricao="Cole uma lista pronta. Quem já está salvo mantém o andamento, e ninguém é duplicado."
      />
      <PainelImportacao config={config} />
    </>
  );
}
