import { describe, expect, it } from "vitest";
import { municipioOficial, municipiosDaUf } from "@/data/municipios";
import { urlDoBanco } from "@/server/env";
import { gerarCsv } from "@/lib/csv";
import { CONFIG_PADRAO, camposFaltando, montarMensagem, MODELO_PADRAO } from "@/lib/mensagem";
import { iguais, sessaoValida, tokenDaSenha } from "@/lib/sessao";
import { classificarSite } from "@/lib/site";
import { formatarTelefone, linkWhatsApp, normalizarTelefone } from "@/lib/telefone";

describe("telefone", () => {
  it("normaliza formatos brasileiros e identifica celular e fixo", () => {
    expect(normalizarTelefone("(19) 98765-4321")).toEqual({ numero: "5519987654321", tipo: "celular" });
    expect(normalizarTelefone("+55 19 3232-1010")).toEqual({ numero: "551932321010", tipo: "fixo" });
    expect(normalizarTelefone("0 15 19 98765-4321")).toEqual({ numero: "5519987654321", tipo: "celular" }); // código de operadora
    expect(normalizarTelefone("19 8765-4321")).toEqual({ numero: "5519987654321", tipo: "celular" }); // sem o nono dígito
    expect(normalizarTelefone("0800 123 4567")).toBeNull();
    expect(normalizarTelefone("(20) 98765-4321")).toBeNull(); // DDD inexistente
    expect(normalizarTelefone("")).toBeNull();
  });

  it("formata e monta o link oficial do WhatsApp", () => {
    expect(formatarTelefone("5519987654321")).toBe("(19) 98765-4321");
    expect(formatarTelefone("551932321010")).toBe("(19) 3232-1010");
    expect(linkWhatsApp("5519987654321", "Olá, tudo bem?")).toBe("https://wa.me/5519987654321?text=Ol%C3%A1%2C%20tudo%20bem%3F");
    expect(linkWhatsApp("5519987654321")).toBe("https://wa.me/5519987654321");
  });
});

describe("site", () => {
  it("separa sem site, só perfil e site próprio", () => {
    expect(classificarSite(null)).toEqual({ status: "sem_site", url: null, rotulo: null });
    expect(classificarSite("  ")).toMatchObject({ status: "sem_site" });
    expect(classificarSite("https://www.instagram.com/barbearia")).toMatchObject({ status: "so_perfil", rotulo: "Instagram" });
    expect(classificarSite("linktr.ee/loja")).toMatchObject({ status: "so_perfil", rotulo: "Linktree", url: "https://linktr.ee/loja" });
    expect(classificarSite("https://minhaloja.wixsite.com/site")).toMatchObject({ status: "so_perfil" });
    expect(classificarSite("https://www.barbeariadojoao.com.br")).toMatchObject({ status: "com_site", rotulo: "barbeariadojoao.com.br" });
  });
});

describe("mensagem", () => {
  const empresa = { nome: "Barbearia do João", cidade: "Campinas", siteStatus: "sem_site" as const, siteRotulo: null };

  it("preenche as variáveis e remove linhas que ficariam vazias", () => {
    const texto = montarMensagem(MODELO_PADRAO, empresa, { ...CONFIG_PADRAO, seuNome: "Ana", suaEmpresa: "Ana Sites" });
    expect(texto).toContain("Aqui é Ana, da Ana Sites.");
    expect(texto).toContain("Encontrei a Barbearia do João pesquisando empresas de Campinas e vi que vocês ainda não têm um site próprio.");
    expect(texto).toMatch(/a partir de R\$\s500,00/);
    expect(texto).not.toContain("Alguns trabalhos"); // sem portfólio, a linha some
    expect(texto).not.toMatch(/\{\w+\}/);

    const semNome = montarMensagem(MODELO_PADRAO, empresa, CONFIG_PADRAO);
    expect(semNome).not.toContain("Aqui é");
    expect(semNome.startsWith("Olá! Tudo bem?")).toBe(true);
  });

  it("adapta a situação do site e mantém variáveis desconhecidas", () => {
    const perfil = montarMensagem("{situacao}", { ...empresa, siteStatus: "so_perfil", siteRotulo: "Instagram" }, CONFIG_PADRAO);
    expect(perfil).toBe("aparecem pelo Instagram, mas ainda não têm um site próprio");
    expect(montarMensagem("Oi {apelido}", empresa, CONFIG_PADRAO)).toBe("Oi {apelido}");
    expect(camposFaltando(CONFIG_PADRAO)).toEqual(["seu nome", "sua empresa"]);
  });
});

describe("municípios", () => {
  it("encontra o nome oficial mesmo sem acento", () => {
    expect(municipioOficial("SP", "sao paulo")).toBe("São Paulo");
    expect(municipioOficial("sp", "SANTA BÁRBARA D'OESTE")).toBe("Santa Bárbara d'Oeste");
    expect(municipioOficial("SP", "Rio de Janeiro")).toBeNull();
    expect(municipiosDaUf("RJ")).toContain("Niterói");
    expect(municipiosDaUf("XX")).toEqual([]);
  });
});

describe("planilha", () => {
  it("escapa separadores e neutraliza fórmulas", () => {
    const csv = gerarCsv(["Nome", "Obs"], [["Loja; Centro", '=HYPERLINK("x")'], ["Ana", null]]);
    expect(csv.startsWith("﻿Nome;Obs\r\n")).toBe(true);
    expect(csv).toContain('"Loja; Centro";"\'=HYPERLINK(""x"")"');
    expect(csv).toContain("Ana;\r\n");
  });
});

describe("sessão", () => {
  it("gera um token estável por senha e compara em tempo constante", async () => {
    const token = await tokenDaSenha("senha-1");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await tokenDaSenha("senha-1")).toBe(token);
    expect(await tokenDaSenha("senha-2")).not.toBe(token);
    expect(await sessaoValida(token, "senha-1")).toBe(true);
    expect(await sessaoValida(token, "senha-2")).toBe(false);
    expect(await sessaoValida(undefined, "senha-1")).toBe(false);
    expect(iguais("abc", "abd")).toBe(false);
  });
});

describe("banco", () => {
  it("aceita os nomes que a integração Neon/Vercel cria", () => {
    expect(urlDoBanco({ DATABASE_URL: "postgres://a", POSTGRES_URL: "postgres://b" })).toBe("postgres://a");
    expect(urlDoBanco({ POSTGRES_URL: "postgres://b" })).toBe("postgres://b");
    expect(urlDoBanco({ STORAGE_DATABASE_URL: "postgres://c" })).toBe("postgres://c");
    expect(urlDoBanco({ DATABASE_URL: " ", OUTRA: "x" })).toBeUndefined();
  });
});
