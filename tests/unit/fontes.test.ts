import { afterEach, describe, expect, it, vi } from "vitest";
import { converterLugar, descreverErroGoogle } from "@/server/fontes/google";
import { consultarOverpass, converterElemento, montarConsultaOsm } from "@/server/fontes/osm";

afterEach(() => vi.unstubAllGlobals());

describe("Google Places", () => {
  it("converte o lugar e classifica o site", () => {
    const empresa = converterLugar(
      {
        id: "abc",
        displayName: { text: " Corte Fino " },
        formattedAddress: "Rua A, 10 - Centro, Campinas - SP",
        addressComponents: [{ longText: "Campinas", shortText: "Campinas", types: ["administrative_area_level_2"] }],
        nationalPhoneNumber: "(19) 98000-0002",
        websiteUri: "https://instagram.com/cortefino",
        businessStatus: "OPERATIONAL",
        rating: 4.7,
        userRatingCount: 120,
      },
      "Campinas",
      "SP",
    );
    expect(empresa).toMatchObject({
      id: "google:abc",
      nome: "Corte Fino",
      telefone: "5519980000002",
      telefoneTipo: "celular",
      siteStatus: "so_perfil",
      siteRotulo: "Instagram",
      cidadeDaFonte: "Campinas",
      fechada: false,
    });
    expect(converterLugar({ id: "x", businessStatus: "CLOSED_PERMANENTLY" }, "Campinas", "SP").fechada).toBe(true);
  });

  it("explica o erro com o motivo do Google e o projeto da chave", () => {
    const texto = descreverErroGoogle(403, {
      error: {
        code: 403,
        message: "The caller does not have permission",
        status: "PERMISSION_DENIED",
        details: [{ reason: "API_KEY_SERVICE_BLOCKED", metadata: { consumer: "projects/987654" } }],
      },
    });
    expect(texto).toContain("Motivo: API_KEY_SERVICE_BLOCKED");
    expect(texto).toContain("não incluem a Places API (New)");
    expect(texto).toContain("nº 987654");
    expect(descreverErroGoogle(403, null)).toMatch(/HTTP 403.*Places API \(New\) está ativada/);
    const generico = descreverErroGoogle(403, {
      error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED", details: [{ links: [{ description: "Ajuda", url: "https://exemplo.test/ajuda" }] }] },
    });
    expect(generico).toContain("Detalhes do Google: PERMISSION_DENIED · Ajuda: https://exemplo.test/ajuda");
  });
});

describe("OpenStreetMap", () => {
  it("monta a consulta com escape e converte os elementos", () => {
    const consulta = montarConsultaOsm({ cidade: "Santa Bárbara d'Oeste", uf: "SP", etiquetas: [], termo: 'pet "shop"', limite: 60 });
    expect(consulta).toContain('["ISO3166-2"="BR-SP"]');
    expect(consulta).toContain('["name"="Santa Bárbara d\'Oeste"]');
    expect(consulta).toContain('pet \\"shop\\"');

    const empresa = converterElemento(
      { type: "node", id: 7, lat: -22.9, lon: -47.06, tags: { name: "Barbearia X", shop: "hairdresser", phone: "+55 19 3232-1010; +55 19 99999-0000", "contact:instagram": "https://instagram.com/x" } },
      "Campinas",
      "SP",
    );
    expect(empresa).toMatchObject({ id: "osm:node/7", telefone: "551932321010", telefoneTipo: "fixo", siteStatus: "so_perfil", fonte: "osm" });
    expect(converterElemento({ type: "node", id: 8, tags: {} }, "Campinas", "SP")).toBeNull();
  });

  it("usa o próximo servidor quando um está sobrecarregado", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(Response.json({ elements: [{ type: "node", id: 1, tags: { name: "A" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await consultarOverpass("[out:json];")).toHaveLength(1);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["https://osm-a.teste/api/interpreter", "https://osm-b.teste/api/interpreter"]);
  });

  it("avisa quando nenhum servidor responde", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 504 })));
    await expect(consultarOverpass("x")).rejects.toThrow(/sobrecarregados.*osm-a\.teste: HTTP 504.*osm-b\.teste: HTTP 504/);
  });
});
