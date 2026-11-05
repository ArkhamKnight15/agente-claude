import { SITE, STATUS } from "@/data/status";
import { gerarCsv } from "@/lib/csv";
import { formatarData } from "@/lib/formato";
import { formatarTelefone, linkWhatsApp } from "@/lib/telefone";
import { estaLogado } from "@/server/auth";
import { listarContatos } from "@/server/contatos";

export const dynamic = "force-dynamic";

const FONTES = { google: "Google", osm: "OpenStreetMap", importado: "Lista importada" } as const;

export async function GET() {
  if (!(await estaLogado())) return new Response("Não autorizado.", { status: 401 });
  const contatos = await listarContatos({}, 10_000);
  const csv = gerarCsv(
    ["Empresa", "Telefone", "WhatsApp", "Cidade", "UF", "Categoria", "Site", "Endereço do site", "Andamento", "Contatado em", "Observação", "Mapa", "Fonte", "Link da fonte"],
    contatos.map((c) => [
      c.nome,
      formatarTelefone(c.telefone),
      c.telefone ? linkWhatsApp(c.telefone) : "",
      c.cidade,
      c.uf,
      c.categoria,
      SITE[c.siteStatus].rotulo,
      c.siteUrl,
      STATUS[c.status].rotulo,
      formatarData(c.contatadoEm),
      c.observacao,
      c.mapsUrl,
      FONTES[c.fonte],
      c.origemUrl,
    ]),
  );
  const dia = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contatos-${dia}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
