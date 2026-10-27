import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/session";
import { BUSINESS_SOURCES } from "@/server/integrations/sources";
import { SearchClient } from "./search-client";

export const metadata: Metadata = { title: "Pesquisa de empresas" };

export default async function SearchPage() {
  await requireUser("lead:write");
  const sources = Object.values(BUSINESS_SOURCES).map((s) => ({ provider: s.provider, label: s.label, configured: s.isConfigured() }));
  return (
    <>
      <PageHeader
        title="Pesquisa de empresas"
        description="Consulte uma fonte oficial, veja quem já está na sua base e importe só o que interessa. Para buscas maiores e automáticas, use Campanhas."
      />
      <SearchClient sources={sources} />
    </>
  );
}
