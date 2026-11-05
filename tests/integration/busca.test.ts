import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { lerConfig, salvarConfig } from "@/server/config";
import { atualizarContato, contarPorStatus, listarContatos, salvarEmpresas } from "@/server/contatos";
import { encerrarConexoes, sql } from "@/server/db";
import { recarregarEnv } from "@/server/env";
import { executarBusca } from "@/server/busca";
import { CONFIG_PADRAO } from "@/lib/mensagem";
import type { BuscaInput } from "@/types";

/** Fluxo real contra Postgres; só a API do Google é simulada. Rode com TEST_DATABASE_URL. */

const lugar = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `p${n}`,
  displayName: { text: `Barbearia ${n}` },
  formattedAddress: `Rua ${n}, Campinas - SP`,
  addressComponents: [{ longText: (extra.cidade as string) ?? "Campinas", shortText: "", types: ["administrative_area_level_2"] }],
  nationalPhoneNumber: `(19) 98000-00${String(n).padStart(2, "0")}`,
  businessStatus: "OPERATIONAL",
  userRatingCount: n,
  ...extra,
});

const PAGINA_1 = [lugar(1), lugar(2, { websiteUri: "https://instagram.com/b2" }), lugar(3, { websiteUri: "https://b3.com.br" }), lugar(4, { businessStatus: "CLOSED_PERMANENTLY" })];
const PAGINA_2 = [lugar(5, { cidade: "Sumaré" }), lugar(6, { nationalPhoneNumber: "(19) 3232-1010" }), lugar(1)];

function simularGoogle() {
  const chamadas: Array<{ pageToken?: string; textQuery: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const corpo = JSON.parse(String(init.body)) as { pageToken?: string; textQuery: string };
      chamadas.push(corpo);
      return Response.json(corpo.pageToken === "p2" ? { places: PAGINA_2 } : { places: PAGINA_1, nextPageToken: "p2" });
    }),
  );
  return chamadas;
}

const busca = (extra: Partial<BuscaInput> = {}): BuscaInput => ({ uf: "SP", cidade: "campinas", nicho: "barbearia", quantidade: 40, fonte: "google", ...extra });

describe.skipIf(!process.env.TEST_DATABASE_URL)("busca e contatos (Postgres)", () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    process.env.PLACES_DAILY_LIMIT = "30";
    recarregarEnv();
    await sql("TRUNCATE prospecta_contatos, prospecta_config, prospecta_uso, prospecta_login");
  });
  afterAll(() => encerrarConexoes());

  it("busca, filtra, salva e ordena as oportunidades", async () => {
    const chamadas = simularGoogle();
    const r = await executarBusca(busca());
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0].textQuery).toBe("barbearia em Campinas - SP");
    expect(chamadas[1].pageToken).toBe("p2");
    expect(r).toMatchObject({ fonte: "google", consultas: 2, recebidas: 6, fechadas: 1, foraDaCidade: 1, novas: 4 });
    // Sem site e celular primeiro; fixo depois; só perfil; com site por último.
    expect(r.contatos.map((c) => [c.nome, c.siteStatus])).toEqual([
      ["Barbearia 1", "sem_site"],
      ["Barbearia 6", "sem_site"],
      ["Barbearia 2", "so_perfil"],
      ["Barbearia 3", "com_site"],
    ]);
    expect(r.contatos.every((c) => c.cidade === "Campinas" && c.status === "novo")).toBe(true);
    expect((await contarPorStatus()).total).toBe(4);
  });

  it("uma nova busca não apaga o andamento e reconhece a mesma empresa pelo telefone", async () => {
    simularGoogle();
    const primeira = await executarBusca(busca());
    const joao = primeira.contatos[0];
    const enviado = await atualizarContato(joao.id, { status: "enviado", observacao: "Chamar à tarde" });
    expect(enviado?.contatadoEm).not.toBeNull();

    const segunda = await executarBusca(busca());
    expect(segunda.novas).toBe(0);
    expect(segunda.contatos.find((c) => c.id === joao.id)).toMatchObject({ status: "enviado", observacao: "Chamar à tarde" });

    // Mesma empresa vinda do OpenStreetMap (outro id, mesmo telefone): não duplica.
    const { contatos, novas } = await salvarEmpresas([{ ...joao, id: "osm:node/99", fonte: "osm" }], "Barbearia");
    expect(novas).toBe(0);
    expect(contatos[0].id).toBe(joao.id);
  });

  it("respeita o limite diário de consultas ao Google", async () => {
    process.env.PLACES_DAILY_LIMIT = "1";
    recarregarEnv();
    const chamadas = simularGoogle();
    const parcial = await executarBusca(busca());
    expect(parcial.consultas).toBe(1); // a segunda página ficaria acima do limite
    expect(chamadas).toHaveLength(1);
    await expect(executarBusca(busca())).rejects.toThrow(/limite de 1 consultas ao Google/);
  });

  it("valida cidade e termo antes de consultar a fonte", async () => {
    const chamadas = simularGoogle();
    await expect(executarBusca(busca({ cidade: "Cidade Inventada" }))).rejects.toThrow(/Não encontramos/);
    await expect(executarBusca(busca({ nicho: "outro", termo: " " }))).rejects.toThrow(/Digite o tipo/);
    expect(chamadas).toHaveLength(0);
  });

  it("filtra contatos por andamento, nome e telefone", async () => {
    simularGoogle();
    const { contatos } = await executarBusca(busca());
    await atualizarContato(contatos[1].id, { status: "nao_contatar" });
    expect(await listarContatos({ status: "nao_contatar" })).toHaveLength(1);
    expect((await listarContatos({ busca: "barbearia 3" }))[0]?.nome).toBe("Barbearia 3");
    expect((await listarContatos({ busca: "3232-1010" }))[0]?.nome).toBe("Barbearia 6");
    expect((await contarPorStatus()).nao_contatar).toBe(1);
  });

  it("guarda a configuração da mensagem com valores padrão", async () => {
    expect(await lerConfig()).toEqual(CONFIG_PADRAO);
    await salvarConfig({ ...CONFIG_PADRAO, seuNome: "Ana", preco: 650 });
    expect(await lerConfig()).toMatchObject({ seuNome: "Ana", preco: 650, modelo: CONFIG_PADRAO.modelo });
  });
});
