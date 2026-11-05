import { NextResponse } from "next/server";
import { ESTADOS } from "@/data/estados";
import { municipiosDaUf } from "@/data/municipios";

/** Lista de municípios de uma UF (gerada no build, servida como arquivo estático). */

export const dynamic = "force-static";

export function generateStaticParams() {
  return ESTADOS.map((e) => ({ uf: e.uf }));
}

export async function GET(_: Request, { params }: { params: Promise<{ uf: string }> }) {
  const { uf } = await params;
  const nomes = municipiosDaUf(uf);
  return nomes.length ? NextResponse.json(nomes) : NextResponse.json({ erro: "UF inválida." }, { status: 404 });
}
