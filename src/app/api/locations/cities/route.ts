import { NextResponse } from "next/server";
import { citiesOf, isValidUf } from "@/data/locations";
import { getCurrentUser } from "@/server/auth/session";

/** Municípios de uma UF (fonte: IBGE), para o seletor de cidade. */
export async function GET(request: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const uf = new URL(request.url).searchParams.get("uf")?.toUpperCase() ?? "";
  if (!isValidUf(uf)) return NextResponse.json({ error: "UF inválida." }, { status: 400 });
  return NextResponse.json(
    { cities: citiesOf(uf).map((c) => ({ name: c.name, capital: c.capital })) },
    { headers: { "Cache-Control": "private, max-age=86400" } },
  );
}
