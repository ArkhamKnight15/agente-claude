import Link from "next/link";
import { PainelBusca } from "@/components/busca/painel-busca";
import { Cabecalho } from "@/components/layout/cabecalho";
import { Aviso } from "@/components/ui/aviso";
import { camposFaltando } from "@/lib/mensagem";
import { googleDisponivel } from "@/server/busca";
import { lerConfig } from "@/server/config";
import { getEnv } from "@/server/env";
import { usoHoje } from "@/server/uso";

// A busca no OpenStreetMap pode levar até ~50 s.
export const maxDuration = 60;

export default async function BuscarPage() {
  const [config, usadas] = await Promise.all([lerConfig(), usoHoje("google")]);
  const faltando = camposFaltando(config);

  return (
    <>
      <Cabecalho titulo="Buscar empresas" descricao="Encontre negócios sem site e envie sua proposta pelo WhatsApp em poucos toques." />
      {faltando.length ? (
        <Aviso tipo="aviso" titulo="Complete sua mensagem" className="mb-6">
          Falta preencher {faltando.join(" e ")} — eles entram no texto enviado. <Link href="/mensagem">Preencher agora</Link>
        </Aviso>
      ) : null}
      <PainelBusca config={config} googleDisponivel={googleDisponivel()} limiteGoogle={getEnv().PLACES_DAILY_LIMIT} usadasHoje={usadas} />
    </>
  );
}
