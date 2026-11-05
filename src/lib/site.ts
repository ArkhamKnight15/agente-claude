import type { SiteStatus } from "@/types";

/**
 * Classifica o endereço informado pela fonte. Perfis em redes sociais, agregadores de links,
 * marketplaces e diretórios não são um site próprio — são as melhores oportunidades depois
 * das empresas sem nenhum endereço.
 */

const PERFIS: Array<[dominio: string, rotulo: string]> = [
  ["instagram.com", "Instagram"],
  ["facebook.com", "Facebook"],
  ["fb.com", "Facebook"],
  ["fb.me", "Facebook"],
  ["tiktok.com", "TikTok"],
  ["youtube.com", "YouTube"],
  ["youtu.be", "YouTube"],
  ["linkedin.com", "LinkedIn"],
  ["x.com", "X"],
  ["twitter.com", "X"],
  ["wa.me", "WhatsApp"],
  ["whatsapp.com", "WhatsApp"],
  ["api.whatsapp.com", "WhatsApp"],
  ["t.me", "Telegram"],
  ["linktr.ee", "Linktree"],
  ["linkin.bio", "Linkin.bio"],
  ["beacons.ai", "Beacons"],
  ["bio.link", "Bio.link"],
  ["taplink.cc", "Taplink"],
  ["ifood.com.br", "iFood"],
  ["rappi.com.br", "Rappi"],
  ["aiqfome.com", "aiqfome"],
  ["anota.ai", "Anota AI"],
  ["goomer.app", "Goomer"],
  ["mercadolivre.com.br", "Mercado Livre"],
  ["shopee.com.br", "Shopee"],
  ["olx.com.br", "OLX"],
  ["getninjas.com.br", "GetNinjas"],
  ["booksy.com", "Booksy"],
  ["trinks.com", "Trinks"],
  ["avec.app", "Avec"],
  ["doctoralia.com.br", "Doctoralia"],
  ["tripadvisor.com.br", "Tripadvisor"],
  ["tripadvisor.com", "Tripadvisor"],
  ["google.com", "Google"],
  ["g.page", "Google"],
  ["business.site", "Site gratuito do Google"],
  ["wixsite.com", "Site gratuito Wix"],
  ["webnode.page", "Site gratuito Webnode"],
  ["webnode.com.br", "Site gratuito Webnode"],
  ["blogspot.com", "Blogger"],
  ["wordpress.com", "WordPress.com"],
  ["negocio.site", "Site gratuito do Google"],
];

export interface ClassificacaoSite {
  status: SiteStatus;
  url: string | null;
  rotulo: string | null;
}

function paraUrl(bruto: string): URL | null {
  const valor = bruto.trim();
  if (!valor) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(valor) ? valor : `https://${valor}`);
    return url.hostname.includes(".") ? url : null;
  } catch {
    return null;
  }
}

export function classificarSite(bruto: string | null | undefined): ClassificacaoSite {
  const url = bruto ? paraUrl(bruto) : null;
  if (!url) return { status: "sem_site", url: null, rotulo: null };
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const perfil = PERFIS.find(([dominio]) => host === dominio || host.endsWith(`.${dominio}`));
  return perfil
    ? { status: "so_perfil", url: url.toString(), rotulo: perfil[1] }
    : { status: "com_site", url: url.toString(), rotulo: host };
}
