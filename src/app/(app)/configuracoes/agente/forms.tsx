"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, fieldError } from "@/components/ui/action-form";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import type { AgentSettings, ContactPolicy, SenderProfile } from "@/lib/settings-schema";
import { saveAgentSettingsAction, saveContactPolicyAction, saveSenderProfileAction } from "@/server/actions/admin";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function AgentForm({ value, disabled, aiConfigured }: { value: AgentSettings; disabled: boolean; aiConfigured: boolean }) {
  const [a, b] = value.variants;
  return (
    <ActionForm action={saveAgentSettingsAction}>
      {(state) => (
        <Card>
          <CardHeader title="Agente de IA e qualificação" description="Como o agente pontua leads e escreve as mensagens." />
          <CardBody>
            <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
              {!aiConfigured ? <Alert tone="info" className="sm:col-span-2">A Claude API não está configurada: as mensagens usam modelos padrão até você definir ANTHROPIC_API_KEY.</Alert> : null}
              <Checkbox name="useAi" defaultChecked={value.useAi} label="Usar IA para analisar leads e escrever mensagens" description="Se desligado ou indisponível, usa modelos padrão." className="sm:col-span-2" />
              <Checkbox name="autoGenerateMessages" defaultChecked={value.autoGenerateMessages} label="Gerar mensagens automaticamente nas campanhas" description="As mensagens sempre vão para a fila de revisão." className="sm:col-span-2" />
              <Field label="Tom das mensagens" htmlFor="tone"><Select id="tone" name="tone" defaultValue={value.tone}><option value="informal">Próximo e natural</option><option value="formal">Cordial e formal</option></Select></Field>
              <Field label="Tamanho máximo no WhatsApp (caracteres)" htmlFor="messageMaxChars" error={fieldError(state, "messageMaxChars")}><Input id="messageMaxChars" name="messageMaxChars" type="number" min={200} max={1500} defaultValue={value.messageMaxChars} /></Field>
              <Field label="Pontuação mínima — prioridade alta" htmlFor="highPriorityMin" error={fieldError(state, "highPriorityMin")}><Input id="highPriorityMin" name="highPriorityMin" type="number" min={1} max={100} defaultValue={value.highPriorityMin} /></Field>
              <Field label="Pontuação mínima — prioridade média" htmlFor="mediumPriorityMin" error={fieldError(state, "mediumPriorityMin")}><Input id="mediumPriorityMin" name="mediumPriorityMin" type="number" min={0} max={99} defaultValue={value.mediumPriorityMin} /></Field>
              <Checkbox name="includeOptOutHint" defaultChecked={value.includeOptOutHint} label="Incluir frase de opt-out (“se não fizer sentido, é só avisar”)" className="sm:col-span-2" />
              <Field label="Instruções adicionais para a IA" htmlFor="extraInstructions" hint="Ex.: mencione que atendo toda a região de Campinas." className="sm:col-span-2"><Textarea id="extraInstructions" name="extraInstructions" rows={2} defaultValue={value.extraInstructions} /></Field>
              <Checkbox name="abTestEnabled" defaultChecked={value.abTestEnabled} label="Teste A/B de mensagens em todas as gerações" description="Cada lead recebe uma variante fixa (atribuição equilibrada)." className="sm:col-span-2" />
              {[a, b].map((v, i) => (
                <div key={v?.key ?? i} className="space-y-2 rounded-lg border border-border p-3">
                  <Field label={`Variante ${i === 0 ? "A" : "B"} — nome`} htmlFor={`variant${i === 0 ? "A" : "B"}Label`}><Input id={`variant${i === 0 ? "A" : "B"}Label`} name={`variant${i === 0 ? "A" : "B"}Label`} defaultValue={v?.label} /></Field>
                  <Field label="Instruções de estilo" htmlFor={`variant${i === 0 ? "A" : "B"}Instructions`}><Textarea id={`variant${i === 0 ? "A" : "B"}Instructions`} name={`variant${i === 0 ? "A" : "B"}Instructions`} rows={2} defaultValue={v?.instructions} /></Field>
                </div>
              ))}
            </fieldset>
          </CardBody>
          {!disabled ? <CardFooter><SubmitButton>Salvar agente</SubmitButton></CardFooter> : null}
        </Card>
      )}
    </ActionForm>
  );
}

export function PolicyForm({ value, disabled }: { value: ContactPolicy; disabled: boolean }) {
  const [mode, setMode] = useState(value.approvalMode);
  return (
    <ActionForm action={saveContactPolicyAction}>
      {(state) => (
        <Card>
          <CardHeader title="Política de contato" description="Limites que impedem contatos insistentes, duplicados ou fora de hora." />
          <CardBody>
            <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
              <Field label="Modo de aprovação" htmlFor="approvalMode" className="sm:col-span-2">
                <Select id="approvalMode" name="approvalMode" value={mode} onChange={(e) => setMode(e.target.value as ContactPolicy["approvalMode"])}>
                  <option value="MANUAL">Manual — toda mensagem precisa de aprovação (recomendado)</option>
                  <option value="AUTO_EMAIL">Aprovar automaticamente apenas e-mails das campanhas</option>
                </Select>
              </Field>
              {mode === "AUTO_EMAIL" ? (
                <Checkbox name="autoApprovalAcknowledged" defaultChecked={value.autoApprovalAcknowledged} className="sm:col-span-2"
                  label="Entendo que e-mails aprovados automaticamente serão enviados sem revisão individual"
                  description="Use apenas com e-mails comerciais públicos, identificação do remetente e descadastro (já incluídos). WhatsApp continua sempre manual." />
              ) : null}
              <Field label="Máximo de mensagens sem resposta" htmlFor="maxUnansweredMessages" error={fieldError(state, "maxUnansweredMessages")}><Input id="maxUnansweredMessages" name="maxUnansweredMessages" type="number" min={1} max={5} defaultValue={value.maxUnansweredMessages} /></Field>
              <Field label="Intervalo mínimo entre contatos (dias)" htmlFor="minDaysBetweenContacts"><Input id="minDaysBetweenContacts" name="minDaysBetweenContacts" type="number" min={1} defaultValue={value.minDaysBetweenContacts} /></Field>
              <Field label="Sugerir acompanhamento após (dias)" htmlFor="followUpAfterDays"><Input id="followUpAfterDays" name="followUpAfterDays" type="number" min={1} defaultValue={value.followUpAfterDays} /></Field>
              <Field label="Bloquear texto repetido por (dias)" htmlFor="duplicateWindowDays"><Input id="duplicateWindowDays" name="duplicateWindowDays" type="number" min={1} defaultValue={value.duplicateWindowDays} /></Field>
              <Field label="Limite diário — WhatsApp" htmlFor="dailyLimitWhatsapp"><Input id="dailyLimitWhatsapp" name="dailyLimitWhatsapp" type="number" min={0} defaultValue={value.dailyLimitWhatsapp} /></Field>
              <Field label="Limite diário — e-mail" htmlFor="dailyLimitEmail"><Input id="dailyLimitEmail" name="dailyLimitEmail" type="number" min={0} defaultValue={value.dailyLimitEmail} /></Field>
              <Field label="Janela de envio — início (hora)" htmlFor="sendWindowStartHour"><Input id="sendWindowStartHour" name="sendWindowStartHour" type="number" min={0} max={23} defaultValue={value.sendWindowStartHour} /></Field>
              <Field label="Janela de envio — fim (hora)" htmlFor="sendWindowEndHour"><Input id="sendWindowEndHour" name="sendWindowEndHour" type="number" min={1} max={24} defaultValue={value.sendWindowEndHour} /></Field>
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-13 font-medium">Dias de envio</legend>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAYS.map((d, i) => <Checkbox key={d} name="sendWeekdays" value={String(i)} defaultChecked={value.sendWeekdays.includes(i)} label={d} />)}
                </div>
              </fieldset>
              <Checkbox name="whatsappRequireOptIn" defaultChecked={value.whatsappRequireOptIn} className="sm:col-span-2" label="Exigir opt-in registrado para iniciar conversa pela API do WhatsApp" description="Exigência da política da Meta para mensagens iniciadas pela empresa." />
              <Field label="Máximo de empresas por campanha" htmlFor="maxLeadsPerCampaign"><Input id="maxLeadsPerCampaign" name="maxLeadsPerCampaign" type="number" min={1} max={1000} defaultValue={value.maxLeadsPerCampaign} /></Field>
              <Field label="Excluir leads nunca contatados após (dias)" htmlFor="retentionDaysUncontacted" hint="0 desativa. Minimização de dados (LGPD)."><Input id="retentionDaysUncontacted" name="retentionDaysUncontacted" type="number" min={0} defaultValue={value.retentionDaysUncontacted} /></Field>
            </fieldset>
          </CardBody>
          {!disabled ? <CardFooter><SubmitButton>Salvar política</SubmitButton></CardFooter> : null}
        </Card>
      )}
    </ActionForm>
  );
}

export function SenderForm({ value, disabled }: { value: SenderProfile; disabled: boolean }) {
  return (
    <ActionForm action={saveSenderProfileAction}>
      {(state) => (
        <Card>
          <CardHeader title="Perfil do remetente" description="Identificação usada nas mensagens, e-mails e propostas." />
          <CardBody>
            <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
              <Field label="Seu nome" htmlFor="name"><Input id="name" name="name" defaultValue={value.name} /></Field>
              <Field label="Nome da empresa" htmlFor="companyName"><Input id="companyName" name="companyName" defaultValue={value.companyName} /></Field>
              <Field label="E-mail de contato" htmlFor="email" error={fieldError(state, "email")}><Input id="email" name="email" type="email" defaultValue={value.email} /></Field>
              <Field label="Telefone" htmlFor="phone"><Input id="phone" name="phone" defaultValue={value.phone} /></Field>
              <Field label="Link do portfólio" htmlFor="portfolioUrl" error={fieldError(state, "portfolioUrl")} hint="Único link permitido nas mensagens."><Input id="portfolioUrl" name="portfolioUrl" type="url" defaultValue={value.portfolioUrl} placeholder="https://" /></Field>
              <Field label="CNPJ (opcional)" htmlFor="cnpj"><Input id="cnpj" name="cnpj" defaultValue={value.cnpj} /></Field>
              <Field label="Cidade" htmlFor="city"><Input id="city" name="city" defaultValue={value.city} /></Field>
              <Field label="Assinatura de e-mail" htmlFor="signature" className="sm:col-span-2"><Textarea id="signature" name="signature" rows={3} defaultValue={value.signature} /></Field>
            </fieldset>
          </CardBody>
          {!disabled ? <CardFooter><SubmitButton>Salvar perfil</SubmitButton></CardFooter> : null}
        </Card>
      )}
    </ActionForm>
  );
}
