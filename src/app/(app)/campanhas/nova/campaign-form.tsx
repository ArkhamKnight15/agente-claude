"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton, fieldError } from "@/components/ui/action-form";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { LocationFields } from "@/components/forms/location-fields";
import { NicheField } from "@/components/forms/niche-field";
import { createCampaignAction } from "@/server/actions/outreach";

interface Props {
  sources: Array<{ provider: string; label: string; configured: boolean }>;
  maxLeads: number;
  searchConfigured: boolean;
  aiConfigured: boolean;
}

const STEPS = [
  "Pesquisar empresas nas fontes selecionadas",
  "Eliminar duplicatas e salvar no CRM",
  "Verificar se cada empresa tem site próprio (com evidências)",
  "Qualificar com pontuação de 0 a 100",
  "Gerar mensagens personalizadas na fila de revisão",
  "Gerar o relatório da campanha",
];

export function CampaignForm({ sources, maxLeads, searchConfigured, aiConfigured }: Props) {
  const router = useRouter();
  const anyConfigured = sources.some((s) => s.configured);
  return (
    <ActionForm
      action={createCampaignAction}
      refresh={false}
      onSuccess={(state) => router.push(`/campanhas/${(state.data as { id: string }).id}`)}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      {(state) => (
        <>
          <div className="space-y-6">
            {!anyConfigured ? (
              <Alert tone="warning" title="Nenhuma fonte de empresas configurada">
                Configure a chave do Google Places ou ative o OpenStreetMap em{" "}
                <Link href="/integracoes" className="underline underline-offset-2">
                  Integrações
                </Link>{" "}
                para iniciar campanhas.
              </Alert>
            ) : null}
            <Card>
              <CardHeader title="Onde e quem procurar" />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <LocationFields errors={{ state: fieldError(state, "state"), city: fieldError(state, "city") }} />
                <NicheField error={fieldError(state, "nicheKey")} />
                <Field label="Quantidade de empresas" htmlFor="targetCount" error={fieldError(state, "targetCount")} hint={`Máximo de ${maxLeads} por campanha (ajustável nas configurações).`} required>
                  <Input id="targetCount" name="targetCount" type="number" min={1} max={maxLeads} defaultValue={Math.min(30, maxLeads)} inputMode="numeric" />
                </Field>
                <Field label="Nome da campanha" htmlFor="name" hint="Opcional — gerado automaticamente.">
                  <Input id="name" name="name" maxLength={100} />
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Critérios e abordagem" />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field label="Prioridade mínima para preparar mensagem" htmlFor="minPriority">
                  <Select id="minPriority" name="minPriority" defaultValue="MEDIUM">
                    <option value="HIGH">Somente alta prioridade</option>
                    <option value="MEDIUM">Alta e média prioridade</option>
                    <option value="LOW">Todas (inclui baixa)</option>
                  </Select>
                </Field>
                <Field label="Canal preferido" htmlFor="preferredChannel" hint="Se o lead não tiver o canal, o outro é usado.">
                  <Select id="preferredChannel" name="preferredChannel" defaultValue="WHATSAPP">
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="EMAIL">E-mail</option>
                  </Select>
                </Field>
                <fieldset className="sm:col-span-2">
                  <legend className="mb-2 text-13 font-medium">Fontes de dados</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sources.map((s) => (
                      <Checkbox
                        key={s.provider}
                        name="providers"
                        value={s.provider}
                        defaultChecked={s.configured}
                        disabled={!s.configured}
                        label={s.label}
                        description={s.configured ? "Configurada" : "Pendente — veja Integrações"}
                      />
                    ))}
                  </div>
                </fieldset>
                <Checkbox
                  className="sm:col-span-2"
                  name="onlyWithoutWebsite"
                  defaultChecked
                  label="Priorizar empresas sem site ou com presença digital fraca"
                  description="Empresas com site profissional não recebem mensagem."
                />
                <Checkbox
                  className="sm:col-span-2"
                  name="abTestEnabled"
                  label="Teste A/B de mensagens"
                  description="Alterna entre as variantes definidas nas Configurações do agente."
                />
              </CardBody>
              <CardFooter>
                <Link href="/campanhas" className="px-3 text-13 text-fg-3 hover:text-fg">
                  Cancelar
                </Link>
                <SubmitButton disabled={!anyConfigured}>Iniciar campanha</SubmitButton>
              </CardFooter>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader title="O que vai acontecer" as="h3" />
              <CardBody>
                <ol className="space-y-3">
                  {STEPS.map((step, i) => (
                    <li key={step} className="flex gap-3 text-13 text-fg-2">
                      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-2xs font-semibold text-accent-soft-fg">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 border-t border-border pt-4 text-xs text-fg-3">
                  Você pode pausar ou cancelar a qualquer momento. Se algo falhar, a campanha retoma de onde parou.
                </p>
              </CardBody>
            </Card>
            {!searchConfigured ? (
              <Alert tone="info" title="Busca web não configurada">
                Sem ela, “sem site” fica como provável, não confirmado.
              </Alert>
            ) : null}
            {!aiConfigured ? (
              <Alert tone="info" title="IA não configurada">
                As mensagens serão geradas por modelos padrão, sem IA.
              </Alert>
            ) : null}
          </aside>
        </>
      )}
    </ActionForm>
  );
}
