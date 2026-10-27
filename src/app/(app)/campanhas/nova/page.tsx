import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/session";
import { BUSINESS_SOURCES } from "@/server/integrations/sources";
import { getWebSearchProvider } from "@/server/integrations/web-search";
import { isLlmConfigured } from "@/server/integrations/llm";
import { getContactPolicy } from "@/server/services/settings";
import { CampaignForm } from "./campaign-form";

export const metadata: Metadata = { title: "Nova campanha" };

export default async function NewCampaignPage() {
  await requireUser("campaign:write");
  const policy = await getContactPolicy();
  const sources = Object.values(BUSINESS_SOURCES).map((s) => ({ provider: s.provider, label: s.label, configured: s.isConfigured() }));
  return (
    <>
      <PageHeader
        breadcrumb={{ href: "/campanhas", label: "Campanhas" }}
        title="Nova campanha"
        description="O agente pesquisa empresas, verifica se têm site, qualifica e prepara mensagens para a sua revisão. Nada é enviado sem aprovação."
      />
      <CampaignForm
        sources={sources}
        maxLeads={policy.maxLeadsPerCampaign}
        searchConfigured={Boolean(getWebSearchProvider())}
        aiConfigured={isLlmConfigured()}
      />
    </>
  );
}
