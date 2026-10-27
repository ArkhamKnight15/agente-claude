import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "prospecta_session";
const PUBLIC_PREFIXES = ["/login", "/descadastro", "/api/webhooks", "/api/health"];

/**
 * Verificação otimista: sem cookie de sessão, redireciona para o login.
 * A validação real da sessão e das permissões acontece no servidor em cada página/ação.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }
  if (!request.cookies.has(SESSION_COOKIE)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
