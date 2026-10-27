import type { Metadata } from "next";
import { CheckCircle2, CircleDashed, ExternalLink, PlugZap } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/session";
import { testIntegrationAction } from "@/server/actions/admin";
import { getEnv } from "@/server/env";
import { can } from "@/server/security/rbac";
import { getIntegrationStatuses } from "@/server/services/integrations";

export const metadata: Metadata = { title: "Integrações" };

const STATUS = {
  active: { label: "Ativa", tone: "success" as const },
  partial: { label: "Parcial", tone: "warning" as const },
  pending: { label: "Pendente", tone: "neutral" as const },
  disabled: { label: "Desativada", tone: "neutral" as const },
};

const WHATSAPP_STEPS = [
  "Crie (ou use) um Portfólio Empresarial verificado no Meta Business Manager (business.facebook.com) com CNPJ.",
  "Em developers.facebook.com, crie um app do tipo “Empresa” e adicione o produto WhatsApp.",
  "Registre um número de telefone exclusivo para a API (ele deixa de funcionar no app WhatsApp comum) e conclua a verificação por SMS/ligação.",
  "Crie um usuário do sistema no Business Manager, atribua o app e a conta do WhatsApp e gere um token permanente com as permissões whatsapp_business_messaging e whatsapp_business_management → WHATSAPP_ACCESS_TOKEN.",
  "Copie o ID do número (Phone number ID) → WHATSAPP_PHONE_NUMBER_ID e o ID da conta (WABA) → WHATSAPP_BUSINESS_ACCOUNT_ID.",
  "Em Configurações do app → Básico, copie a Chave secreta do app → WHATSAPP_APP_SECRET. Invente um texto longo para WHATSAPP_WEBHOOK_VERIFY_TOKEN.",
  "Em WhatsApp → Configuração, cadastre o webhook (URL abaixo, com HTTPS público) com o mesmo token de verificação e assine o campo “messages”.",
  "Crie e aguarde a aprovação de um modelo de mensagem (categoria Marketing ou Utilidade, idioma pt_BR) com variável {{1}} para o nome da empresa → WHATSAPP_TEMPLATE_NAME.",
  "Adicione um método de pagamento na conta do WhatsApp (conversas iniciadas pela empresa são cobradas pela Meta).",
  "Respeite a política da Meta: mensagens iniciadas pela empresa exigem consentimento (opt-in). Sem opt-in, use o envio manual assistido.",
];

export default async function IntegrationsPage() {
  const user = await requireUser("settings:read");
  const statuses = await getIntegrationStatuses();
  const canTest = can(user.role, "integration:manage");
  const webhookUrl = `${getEnv().APP_URL}/api/webhooks/whatsapp`;

  return (
    <>
      <PageHeader
        title="Integrações"
        description="Credenciais ficam apenas em variáveis de ambiente no servidor — nunca no navegador nem no banco. Os testes fazem chamadas reais."
      />
      <Alert tone="info" className="mb-6" title="Como ativar uma integração">
        Preencha as variáveis indicadas no arquivo <code className="font-mono text-xs">.env</code> (veja <code className="font-mono text-xs">.env.example</code>) e reinicie a aplicação e o worker.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {statuses.map((s) => (
          <Card key={s.key} className="flex flex-col">
            <CardHeader
              title={s.name}
              description={s.purpose}
              action={<Badge tone={STATUS[s.status].tone} dot>{STATUS[s.status].label}</Badge>}
            />
            <CardBody className="flex flex-1 flex-col gap-4">
              <ul className="space-y-1 text-13 text-fg-2">{s.details.map((d) => <li key={d}>{d}</li>)}</ul>
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-3">Variáveis de ambiente</p>
                <ul className="flex flex-wrap gap-1.5">
                  {s.envVars.map((v) => (
                    <li key={v.name} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 font-mono text-2xs text-fg-2">
                      {v.set ? <CheckCircle2 className="size-3 text-success" aria-label="definida" /> : <CircleDashed className={v.required ? "size-3 text-warning" : "size-3 text-fg-3"} aria-label={v.required ? "obrigatória, não definida" : "opcional, não definida"} />}
                      {v.name}
                    </li>
                  ))}
                </ul>
              </div>
              {s.usageToday !== undefined ? (
                <p className="text-xs text-fg-3">Uso hoje: {s.usageToday}{s.dailyLimit ? ` de ${s.dailyLimit} chamadas (limite diário)` : " chamadas"}</p>
              ) : null}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <a href={s.docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-13 text-accent hover:underline">
                  Documentação oficial <ExternalLink className="size-3" aria-hidden />
                </a>
                {canTest && s.testable ? (
                  <ActionButton size="sm" action={testIntegrationAction.bind(null, s.key)} title={s.testCost}>
                    <PlugZap /> Testar conexão
                  </ActionButton>
                ) : null}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader title="Conectar o WhatsApp oficial (Cloud API)" description="Passo a passo — exige sua participação na Meta; não há como ativar sem a conta empresarial." />
        <CardBody>
          <ol className="space-y-2.5">
            {WHATSAPP_STEPS.map((step, i) => (
              <li key={step} className="flex gap-3 text-13 text-fg-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-2xs font-semibold text-accent-soft-fg">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs break-all text-fg-2">URL do webhook: {webhookUrl}</p>
        </CardBody>
      </Card>
    </>
  );
}
