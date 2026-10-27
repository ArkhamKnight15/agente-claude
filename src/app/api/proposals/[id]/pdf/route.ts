import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { NotFoundError } from "@/server/errors";
import { renderProposalPdf } from "@/server/pdf/proposal-pdf";
import { audit } from "@/server/security/audit";
import { can } from "@/server/security/rbac";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!can(user.role, "proposal:read")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await params;
  try {
    const pdf = await renderProposalPdf(id);
    await audit({ userId: user.id, action: "proposal.pdf", entityType: "Proposal", entityId: id });
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="proposta-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
