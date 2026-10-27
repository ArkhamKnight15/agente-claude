/**
 * Domínios que NÃO representam um site próprio da empresa.
 * Usado na verificação de presença digital para diferenciar site oficial de perfis,
 * diretórios, marketplaces e construtores com subdomínio gratuito.
 */

export type PlatformKind =
  | "social"
  | "messaging"
  | "maps"
  | "directory"
  | "marketplace"
  | "booking"
  | "link_aggregator"
  | "free_builder";

export interface PlatformInfo {
  kind: PlatformKind;
  label: string;
}

const entries: Array<[string, PlatformKind, string]> = [
  // Redes sociais
  ["instagram.com", "social", "Instagram"],
  ["facebook.com", "social", "Facebook"],
  ["fb.com", "social", "Facebook"],
  ["fb.me", "social", "Facebook"],
  ["tiktok.com", "social", "TikTok"],
  ["youtube.com", "social", "YouTube"],
  ["youtu.be", "social", "YouTube"],
  ["linkedin.com", "social", "LinkedIn"],
  ["twitter.com", "social", "X (Twitter)"],
  ["x.com", "social", "X (Twitter)"],
  ["pinterest.com", "social", "Pinterest"],
  ["kwai.com", "social", "Kwai"],
  ["threads.net", "social", "Threads"],
  // Mensageiros
  ["wa.me", "messaging", "WhatsApp"],
  ["whatsapp.com", "messaging", "WhatsApp"],
  ["t.me", "messaging", "Telegram"],
  // Mapas
  ["google.com", "maps", "Google"],
  ["google.com.br", "maps", "Google"],
  ["goo.gl", "maps", "Google Maps"],
  ["g.page", "maps", "Google Business"],
  ["g.co", "maps", "Google"],
  ["waze.com", "maps", "Waze"],
  ["moovitapp.com", "maps", "Moovit"],
  ["openstreetmap.org", "maps", "OpenStreetMap"],
  ["apple.com", "maps", "Apple Maps"],
  // Diretórios e cadastros
  ["guiamais.com.br", "directory", "GuiaMais"],
  ["apontador.com.br", "directory", "Apontador"],
  ["telelistas.net", "directory", "TeleListas"],
  ["solutudo.com.br", "directory", "Solutudo"],
  ["cnpj.biz", "directory", "CNPJ.biz"],
  ["cnpja.com", "directory", "CNPJá"],
  ["cnpj.info", "directory", "CNPJ.info"],
  ["econodata.com.br", "directory", "Econodata"],
  ["casadosdados.com.br", "directory", "Casa dos Dados"],
  ["empresaqui.com.br", "directory", "EmpresAqui"],
  ["consultasocio.com", "directory", "Consulta Sócio"],
  ["informecadastral.com.br", "directory", "Informe Cadastral"],
  ["listamais.com.br", "directory", "ListaMais"],
  ["cylex.com.br", "directory", "Cylex"],
  ["hotfrog.com.br", "directory", "Hotfrog"],
  ["infobel.com", "directory", "Infobel"],
  ["kompass.com", "directory", "Kompass"],
  ["yelp.com", "directory", "Yelp"],
  ["yelp.com.br", "directory", "Yelp"],
  ["tripadvisor.com", "directory", "Tripadvisor"],
  ["tripadvisor.com.br", "directory", "Tripadvisor"],
  ["foursquare.com", "directory", "Foursquare"],
  ["reclameaqui.com.br", "directory", "Reclame Aqui"],
  ["guiadacidade.com.br", "directory", "Guia da Cidade"],
  ["achei.com.br", "directory", "Achei"],
  ["encontrasp.com.br", "directory", "EncontraSP"],
  ["encontra.com", "directory", "Encontra"],
  ["portaldaempresa.com", "directory", "Portal da Empresa"],
  ["serasaexperian.com.br", "directory", "Serasa"],
  ["receitaws.com.br", "directory", "ReceitaWS"],
  ["brasilapi.com.br", "directory", "BrasilAPI"],
  ["doctoralia.com.br", "booking", "Doctoralia"],
  ["boaconsulta.com", "booking", "BoaConsulta"],
  // Marketplaces e delivery
  ["ifood.com.br", "marketplace", "iFood"],
  ["rappi.com.br", "marketplace", "Rappi"],
  ["aiqfome.com", "marketplace", "aiqfome"],
  ["mercadolivre.com.br", "marketplace", "Mercado Livre"],
  ["olx.com.br", "marketplace", "OLX"],
  ["shopee.com.br", "marketplace", "Shopee"],
  ["getninjas.com.br", "marketplace", "GetNinjas"],
  ["habitissimo.com.br", "marketplace", "Habitissimo"],
  ["webmotors.com.br", "marketplace", "Webmotors"],
  ["zapimoveis.com.br", "marketplace", "ZAP Imóveis"],
  ["vivareal.com.br", "marketplace", "VivaReal"],
  ["imovelweb.com.br", "marketplace", "Imovelweb"],
  ["quintoandar.com.br", "marketplace", "QuintoAndar"],
  ["chavesnamao.com.br", "marketplace", "Chaves na Mão"],
  ["goomer.app", "marketplace", "Goomer"],
  ["anota.ai", "marketplace", "Anota AI"],
  // Agendamento
  ["booksy.com", "booking", "Booksy"],
  ["trinks.com", "booking", "Trinks"],
  ["avec.app", "booking", "Avec"],
  ["simplesagenda.com.br", "booking", "Simples Agenda"],
  ["agendaedu.com", "booking", "Agenda Edu"],
  ["tuaagenda.com", "booking", "Tua Agenda"],
  // Agregadores de link
  ["linktr.ee", "link_aggregator", "Linktree"],
  ["linkin.bio", "link_aggregator", "Linkin.bio"],
  ["beacons.ai", "link_aggregator", "Beacons"],
  ["bio.link", "link_aggregator", "Bio.link"],
  ["linkbio.co", "link_aggregator", "LinkBio"],
  ["campsite.bio", "link_aggregator", "Campsite"],
  ["taplink.cc", "link_aggregator", "Taplink"],
  ["msha.ke", "link_aggregator", "Milkshake"],
  // Construtores com subdomínio gratuito (é um site, mas sem domínio próprio)
  ["business.site", "free_builder", "Google Sites (Perfil da Empresa)"],
  ["negocio.site", "free_builder", "Google Sites (Perfil da Empresa)"],
  ["sites.google.com", "free_builder", "Google Sites"],
  ["wixsite.com", "free_builder", "Wix (subdomínio)"],
  ["webnode.page", "free_builder", "Webnode (subdomínio)"],
  ["webnode.com.br", "free_builder", "Webnode (subdomínio)"],
  ["blogspot.com", "free_builder", "Blogger"],
  ["wordpress.com", "free_builder", "WordPress.com (subdomínio)"],
  ["carrd.co", "free_builder", "Carrd (subdomínio)"],
  ["godaddysites.com", "free_builder", "GoDaddy (subdomínio)"],
  ["weebly.com", "free_builder", "Weebly (subdomínio)"],
  ["site123.me", "free_builder", "Site123 (subdomínio)"],
  ["ueniweb.com", "free_builder", "Ueni (subdomínio)"],
  ["netlify.app", "free_builder", "Netlify (subdomínio)"],
  ["vercel.app", "free_builder", "Vercel (subdomínio)"],
  ["github.io", "free_builder", "GitHub Pages"],
  ["canva.site", "free_builder", "Canva (subdomínio)"],
  ["my.canva.site", "free_builder", "Canva (subdomínio)"],
  ["hotmart.com", "marketplace", "Hotmart"],
];

export const PLATFORM_DOMAINS: ReadonlyMap<string, PlatformInfo> = new Map(
  entries.map(([domain, kind, label]) => [domain, { kind, label }]),
);
