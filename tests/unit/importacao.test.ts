import { describe, expect, it } from "vitest";
import { dividirLinha, lerData, lerLista } from "@/lib/importacao";

describe("leitura da lista importada", () => {
  it("lê CSV com ponto e vírgula, cabeçalho em qualquer ordem e aspas", () => {
    const { linhas } = lerLista(`Telefone;Empresa;Cidade;UF;Instagram
(19) 98000-0001;Barbearia do João;Campinas;SP;
"19 3232-1010";"Studio ""Barba""; Cia";Campinas;SP;instagram.com/studio`);
    expect(linhas).toEqual([
      { linha: 2, campos: { telefone: "(19) 98000-0001", nome: "Barbearia do João", cidade: "Campinas", uf: "SP" } },
      { linha: 3, campos: { telefone: "19 3232-1010", nome: 'Studio "Barba"; Cia', cidade: "Campinas", uf: "SP", site: "instagram.com/studio" } },
    ]);
  });

  it("aceita planilha colada (tabulação), tabela Markdown e lista sem cabeçalho", () => {
    expect(lerLista("nome\tcidade\tuf\nPadaria Sol\tCampinas\tSP").linhas[0].campos).toEqual({ nome: "Padaria Sol", cidade: "Campinas", uf: "SP" });

    const markdown = lerLista("| Nome | Telefone | Cidade | UF |\n|---|---|---|---|\n| Pet Feliz | (11) 98888-7777 | São Paulo | SP |");
    expect(markdown.linhas).toEqual([{ linha: 3, campos: { nome: "Pet Feliz", telefone: "(11) 98888-7777", cidade: "São Paulo", uf: "SP" } }]);

    const semCabecalho = lerLista("```\nOficina Alfa;19 98000-0003;Campinas;SP;-;Oficina\n```");
    expect(semCabecalho.linhas[0].campos).toEqual({ nome: "Oficina Alfa", telefone: "19 98000-0003", cidade: "Campinas", uf: "SP", categoria: "Oficina" });
  });

  it("ignora linhas vazias e limita o tamanho da importação", () => {
    expect(lerLista("\n  \n").linhas).toEqual([]);
    const grande = ["nome;cidade;uf", ...Array.from({ length: 305 }, (_, i) => `Empresa ${i};Campinas;SP`)].join("\n");
    const r = lerLista(grande);
    expect(r.linhas).toHaveLength(300);
    expect(r.excedeu).toBe(true);
    expect(dividirLinha("a, b ,c", ",")).toEqual(["a", "b", "c"]);
  });

  it("lê a data da consulta em dd/mm/aaaa ou aaaa-mm-dd", () => {
    expect(lerData("05/11/2026")).toBe("2026-11-05T15:00:00.000Z");
    expect(lerData("2026-11-05")).toBe("2026-11-05T15:00:00.000Z");
    expect(lerData("31/02/2026")).toBeNull();
    expect(lerData("ontem")).toBeNull();
    expect(lerLista("nome;cidade;uf;consultado em\nA;Campinas;SP;05/11/2026").linhas[0].campos.consultado).toBe("05/11/2026");
  });
});
