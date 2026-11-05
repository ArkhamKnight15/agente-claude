import "server-only";
import { cookies, headers } from "next/headers";
import { COOKIE_SESSAO, DURACAO_SESSAO_S, iguais, sessaoValida, tokenDaSenha } from "@/lib/sessao";
import { sql } from "./db";
import { getEnv } from "./env";
import { ErroDeUsuario } from "./erros";

const MAX_TENTATIVAS = 10;
const JANELA_MIN = 15;

export async function estaLogado(): Promise<boolean> {
  const cookie = (await cookies()).get(COOKIE_SESSAO)?.value;
  return sessaoValida(cookie, getEnv().APP_PASSWORD);
}

/** Usado nas ações: o proxy já barra quem não entrou, mas cada ação confere de novo. */
export async function exigirLogin(): Promise<void> {
  if (!(await estaLogado())) throw new ErroDeUsuario("Sua sessão expirou. Entre de novo.");
}

async function ipDoCliente(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

/** Confere a senha com limite de tentativas por IP e grava o cookie de acesso. */
export async function entrar(senha: string): Promise<void> {
  const ip = await ipDoCliente();
  const [registro] = await sql<{ tentativas: number }>(
    `INSERT INTO prospecta_login (ip, tentativas, janela) VALUES ($1, 1, now())
     ON CONFLICT (ip) DO UPDATE SET
       tentativas = CASE WHEN prospecta_login.janela < now() - make_interval(mins => $2) THEN 1 ELSE prospecta_login.tentativas + 1 END,
       janela = CASE WHEN prospecta_login.janela < now() - make_interval(mins => $2) THEN now() ELSE prospecta_login.janela END
     RETURNING tentativas`,
    [ip, JANELA_MIN],
  );
  if (registro.tentativas > MAX_TENTATIVAS) {
    throw new ErroDeUsuario(`Muitas tentativas. Aguarde ${JANELA_MIN} minutos e tente de novo.`);
  }
  const esperado = await tokenDaSenha(getEnv().APP_PASSWORD);
  const informado = await tokenDaSenha(senha);
  if (!iguais(esperado, informado)) throw new ErroDeUsuario("Senha incorreta.");

  await sql("DELETE FROM prospecta_login WHERE ip = $1", [ip]);
  (await cookies()).set(COOKIE_SESSAO, esperado, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
}

export async function sair(): Promise<void> {
  (await cookies()).delete(COOKIE_SESSAO);
}
