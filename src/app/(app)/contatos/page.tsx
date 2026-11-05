import { Download } from "lucide-react";
import type { Metadata } from "next";
import { ListaContatos } from "@/components/contatos/lista-contatos";
import { Cabecalho } from "@/components/layout/cabecalho";
import { LinkBotao } from "@/components/ui/botao";
import { ORDEM_STATUS } from "@/data/status";
import { plural } from "@/lib/formato";
import { lerConfig } from "@/server/config";
import { contarPorStatus, listarContatos } from "@/server/contatos";
import type { ContatoStatus } from "@/types";

export const metadata: Metadata = { title: "Contatos" };

export default async function ContatosPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status: statusBruto, q } = await searchParams;
  const status = ORDEM_STATUS.includes(statusBruto as ContatoStatus) ? (statusBruto as ContatoStatus) : undefined;
  const busca = (q ?? "").slice(0, 80);
  const [contatos, contagem, config] = await Promise.all([listarContatos({ status, busca }), contarPorStatus(), lerConfig()]);

  return (
    <>
      <Cabecalho
        titulo="Contatos"
        descricao={`${plural(contagem.total, "empresa salva", "empresas salvas")} · o andamento é o mesmo no computador e no celular.`}
        acoes={
          contagem.total ? (
            <LinkBotao href="/api/contatos/csv" variante="secundario" icone={<Download aria-hidden />} download>
              Exportar planilha
            </LinkBotao>
          ) : null
        }
      />
      <ListaContatos contatos={contatos} contagem={contagem} config={config} status={status} busca={busca} />
    </>
  );
}
