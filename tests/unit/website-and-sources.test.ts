import { describe, expect, it } from "vitest";
import { assessWebsiteQuality, decideWebsiteStatus, extractSignals, type CandidateEvaluation } from "@/lib/agent/website-analysis";
import { rootDisallowed } from "@/server/agent/robots";
import { __test as httpTest } from "@/server/integrations/http";
import { mapGooglePlace } from "@/server/integrations/sources/google-places";
import { buildOverpassQuery, mapOverpassElement } from "@/server/integrations/sources/openstreetmap";
import { classifyUrl, normalizeWebsiteUrl, registrableDomain } from "@/lib/url";

const business = { name: "Oficina Silva", city: "Campinas", phoneE164: "+5519987654321" };
const page = (html: string, finalUrl = "https://oficinasilva.com.br") => ({ requestedUrl: finalUrl, finalUrl, status: 200, html, responseMs: 300 });

const goodHtml = `<!doctype html><html><head><title>Oficina Silva | Mecânica em Campinas</title><meta name="viewport" content="width=device-width"></head>
<body><h1>Oficina Silva</h1><p>${"Serviços de mecânica completa em Campinas. ".repeat(20)}</p><a href="https://wa.me/5519987654321">WhatsApp</a>
<a href="mailto:contato@oficinasilva.com.br">e-mail</a><a href="https://instagram.com/oficinasilva">insta</a><footer>© ${new Date().getFullYear()} Oficina Silva</footer></body></html>`;

describe("classificação de URLs", () => {
  it("diferencia site próprio de redes, diretórios e construtores gratuitos", () => {
    expect(classifyUrl("https://www.instagram.com/oficina")?.kind).toBe("social");
    expect(classifyUrl("https://m.facebook.com/oficina")?.kind).toBe("social");
    expect(classifyUrl("https://www.google.com/maps/place/x")?.kind).toBe("maps");
    expect(classifyUrl("https://guiamais.com.br/campinas/x")?.kind).toBe("directory");
    expect(classifyUrl("https://oficina.wixsite.com/site")?.kind).toBe("free_builder");
    expect(classifyUrl("https://sites.google.com/view/oficina")?.kind).toBe("free_builder");
    expect(classifyUrl("https://linktr.ee/oficina")?.kind).toBe("link_aggregator");
    expect(classifyUrl("oficinasilva.com.br")?.kind).toBe("own_domain");
  });

  it("calcula o domínio registrável brasileiro e limpa rastreadores", () => {
    expect(registrableDomain("loja.exemplo.com.br")).toBe("exemplo.com.br");
    expect(registrableDomain("www.dr-joao.med.br")).toBe("dr-joao.med.br");
    expect(normalizeWebsiteUrl("exemplo.com.br/?utm_source=x&id=2#topo")).toBe("https://exemplo.com.br/?id=2");
  });
});

describe("análise de sites", () => {
  it("extrai sinais e contatos públicos da página da empresa", () => {
    const s = extractSignals(page(goodHtml), business);
    expect(s.hasViewport).toBe(true);
    expect(s.mentionsPhone).toBe(true);
    expect(s.emails).toContain("contato@oficinasilva.com.br");
    expect(s.whatsappNumbers).toContain("+5519987654321");
    expect(s.instagramUrls[0]).toMatch(/instagram\.com\/oficinasilva/);
    expect(assessWebsiteQuality(s).professional).toBe(true);
  });

  it("aponta problemas: sem HTTPS, sem viewport, rodapé antigo, em construção", () => {
    const old = `<html><head><title>Oficina</title></head><body>Site em construção. © 2015 Oficina Silva</body></html>`;
    const q = assessWebsiteQuality(extractSignals(page(old, "http://oficinasilva.com.br"), business));
    expect(q.professional).toBe(false);
    expect(q.issues.join(" ")).toMatch(/HTTPS/);
    expect(q.issues.join(" ")).toMatch(/celular/);
    expect(q.issues.join(" ")).toMatch(/2015/);
  });

  const reachable = (origin: "listing" | "search"): CandidateEvaluation => {
    const signals = extractSignals(page(goodHtml), business);
    return { url: "https://oficinasilva.com.br", origin, domainMatch: 1, signals, quality: assessWebsiteQuality(signals) };
  };

  it("não confirma ausência de site com uma única busca", () => {
    const d = decideWebsiteStatus({ listingHasWebsiteField: true, listingWebsiteKind: "none", searchConfigured: true, searchRuns: [{ query: "q1", ok: true, resultCount: 10 }], candidates: [] });
    expect(d.status).toBe("NO_WEBSITE_LIKELY");
    expect(d.confidence).toBe("PROBABLE");
  });

  it("confirma ausência com perfil sem site e duas buscas sem domínio próprio", () => {
    const d = decideWebsiteStatus({
      listingHasWebsiteField: true, listingWebsiteKind: "none", searchConfigured: true,
      searchRuns: [{ query: "q1", ok: true, resultCount: 10 }, { query: "q2", ok: true, resultCount: 8 }], candidates: [],
    });
    expect(d.status).toBe("NO_WEBSITE_CONFIRMED");
    expect(d.confidence).toBe("CONFIRMED");
  });

  it("sem busca configurada, a ausência fica como provável", () => {
    const d = decideWebsiteStatus({ listingHasWebsiteField: false, listingWebsiteKind: "none", searchConfigured: false, searchRuns: [], candidates: [] });
    expect(d.status).toBe("NO_WEBSITE_LIKELY");
    expect(d.confidence).toBe("UNVERIFIED");
  });

  it("busca com falha resulta em inconclusivo", () => {
    const d = decideWebsiteStatus({ listingHasWebsiteField: true, listingWebsiteKind: "none", searchConfigured: true, searchRuns: [{ query: "q", ok: false, resultCount: 0, error: "x" }], candidates: [] });
    expect(d.status).toBe("INCONCLUSIVE");
  });

  it("reconhece site profissional e site em construtor gratuito", () => {
    expect(decideWebsiteStatus({ listingHasWebsiteField: true, listingWebsiteKind: "own_domain", searchConfigured: false, searchRuns: [], candidates: [reachable("listing")] }).status).toBe("PROFESSIONAL_WEBSITE");
    expect(decideWebsiteStatus({ listingHasWebsiteField: true, listingWebsiteKind: "free_builder", searchConfigured: false, searchRuns: [], candidates: [] }).status).toBe("WEBSITE_WITH_ISSUES");
  });

  it("site informado com domínio inexistente conta como site com problemas", () => {
    const broken: CandidateEvaluation = { url: "https://oficinasilva.com.br", origin: "listing", domainMatch: 1, signals: null, quality: null, fetchError: "DNS", fetchErrorCode: "DNS" };
    expect(decideWebsiteStatus({ listingHasWebsiteField: true, listingWebsiteKind: "own_domain", searchConfigured: false, searchRuns: [], candidates: [broken] }).status).toBe("WEBSITE_WITH_ISSUES");
  });
});

describe("robots.txt e proteção SSRF", () => {
  it("respeita bloqueio da raiz", () => {
    expect(rootDisallowed("User-agent: *\nDisallow: /")).toBe(true);
    expect(rootDisallowed("User-agent: *\nDisallow: /admin")).toBe(false);
    expect(rootDisallowed("User-agent: ProspectaBot\nDisallow: /\n\nUser-agent: *\nAllow: /")).toBe(true);
  });

  it("bloqueia endereços internos", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "172.20.0.1", "169.254.169.254", "::1", "fd00::1"]) {
      expect(httpTest.isPrivateAddress(ip)).toBe(true);
    }
    expect(httpTest.isPrivateAddress("200.147.67.142")).toBe(false);
  });
});

describe("fontes de empresas", () => {
  it("mapeia o retorno do Google Places (API New)", () => {
    const raw = mapGooglePlace({
      id: "ChIJ123",
      displayName: { text: "Oficina Silva" },
      formattedAddress: "R. A, 10 - Centro, Campinas - SP",
      addressComponents: [
        { longText: "Campinas", shortText: "Campinas", types: ["administrative_area_level_2", "political"] },
        { longText: "São Paulo", shortText: "SP", types: ["administrative_area_level_1", "political"] },
        { longText: "Centro", shortText: "Centro", types: ["sublocality_level_1"] },
      ],
      internationalPhoneNumber: "+55 19 98765-4321",
      googleMapsUri: "https://maps.google.com/?cid=1",
      businessStatus: "OPERATIONAL",
      rating: 4.6,
      userRatingCount: 51,
    });
    expect(raw).toMatchObject({ provider: "GOOGLE_PLACES", externalId: "ChIJ123", city: "Campinas", state: "SP", neighborhood: "Centro", website: null, hasWebsiteField: true, reviewCount: 51 });
  });

  it("mapeia elementos do OpenStreetMap e escapa a consulta Overpass", () => {
    const raw = mapOverpassElement(
      { type: "node", id: 42, lat: -22.9, lon: -47.06, tags: { name: "Barbearia X", shop: "hairdresser", "contact:instagram": "barbeariax", phone: "+55 19 3232-1010; +55 19 99999-0000" } },
      "Campinas",
      "SP",
    );
    expect(raw).toMatchObject({ externalId: "node/42", phone: "+55 19 3232-1010", instagram: "https://www.instagram.com/barbeariax", hasWebsiteField: false });
    const q = buildOverpassQuery({ term: 'pet "shop"', city: "Santa Bárbara d'Oeste", state: "SP", limit: 10 }, 50);
    expect(q).toContain('["ISO3166-2"="BR-SP"]');
    expect(q).toContain('["name"="Santa Bárbara d\'Oeste"]');
    expect(q).toContain('pet \\"shop\\"');
  });
});
