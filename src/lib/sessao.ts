/**
 * Sessão sem banco: o cookie guarda um HMAC derivado da senha do app. Trocar APP_PASSWORD
 * invalida todos os aparelhos. Usa Web Crypto para funcionar no proxy e no servidor.
 */

export const COOKIE_SESSAO = "prospecta_acesso";
export const DURACAO_SESSAO_S = 180 * 24 * 3600;

export async function tokenDaSenha(senha: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode("prospecta-acesso-v1"));
  return Array.from(new Uint8Array(assinatura), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante. */
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export async function sessaoValida(cookie: string | undefined, senha: string): Promise<boolean> {
  return Boolean(cookie) && iguais(cookie ?? "", await tokenDaSenha(senha));
}
