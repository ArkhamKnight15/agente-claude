import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/session";
import { isLlmConfigured } from "@/server/integrations/llm";
import { can } from "@/server/security/rbac";
import { getAgentSettings, getContactPolicy, getSenderProfile } from "@/server/services/settings";
import { AgentForm, PolicyForm, SenderForm } from "./forms";

export const metadata: Metadata = { title: "Configurações do agente" };

export default async function AgentSettingsPage() {
  const user = await requireUser("settings:read");
  const [agent, policy, sender] = await Promise.all([getAgentSettings(), getContactPolicy(), getSenderProfile()]);
  const disabled = !can(user.role, "settings:write");
  return (
    <>
      <PageHeader title="Configurações do agente" description="Ajuste como o agente qualifica, escreve e respeita os limites de contato." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <SenderForm value={sender} disabled={disabled} />
          <AgentForm value={agent} disabled={disabled} aiConfigured={isLlmConfigured()} />
        </div>
        <PolicyForm value={policy} disabled={disabled} />
      </div>
    </>
  );
}
