import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Verificação de saúde para o provedor de hospedagem (sem dados sensíveis). */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const worker = await db.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true } });
    return NextResponse.json({ ok: true, db: "up", workerOnline: Boolean(worker && Date.now() - worker.lastSeenAt.getTime() < 60_000) });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
