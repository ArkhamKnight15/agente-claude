import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, sessaoValida } from "@/lib/sessao";

/**
 * Barra quem não entrou com a senha. As páginas e ações conferem de novo no servidor.
 * Sem APP_PASSWORD configurada, deixa passar: a página mostra o que falta configurar.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/cidades/")) return NextResponse.next();

  const senha = process.env.APP_PASSWORD?.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!senha) return NextResponse.next();
  if (await sessaoValida(request.cookies.get(COOKIE_SESSAO)?.value, senha)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?destino=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
