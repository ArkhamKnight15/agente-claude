import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { can } from "@/server/security/rbac";
import { exportLeadData } from "@/server/services/leads";

/** Exportação completa dos dados de um lead (atendimento a pedido do titular — LGPD). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!can(user.role, "lead:export")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  try {
    const data = await exportLeadData(id, user.id);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="lead-${id}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
