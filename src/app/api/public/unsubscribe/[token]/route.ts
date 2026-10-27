import { NextResponse } from "next/server";
import { hitRateLimit } from "@/server/security/rate-limit";
import { unsubscribeByToken } from "@/server/services/unsubscribe";

/** Descadastro com um clique (RFC 8058) — chamado pelos provedores de e-mail. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  if (!(await hitRateLimit(`unsub:${ip}`, 60, 3600)).allowed) return NextResponse.json({ error: "Limite excedido." }, { status: 429 });
  const result = await unsubscribeByToken((await params).token);
  return NextResponse.json({ ok: result === "done" }, { status: result === "done" ? 200 : 400 });
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return NextResponse.redirect(new URL(`/descadastro/${(await params).token}`, request.url));
}
