import type { Metadata } from "next";
import { Cabecalho } from "@/components/layout/cabecalho";
import { FormularioMensagem } from "@/components/mensagem/formulario-mensagem";
import { lerConfig } from "@/server/config";

export const metadata: Metadata = { title: "Mensagem" };

export default async function MensagemPage() {
  const config = await lerConfig();
  return (
    <>
      <Cabecalho titulo="Mensagem" descricao="O texto que vai pronto para cada empresa. Você ainda pode ajustar antes de enviar." />
      <FormularioMensagem inicial={config} />
    </>
  );
}
