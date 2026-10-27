"use client";

import { useState } from "react";
import { Ban, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import type { Channel, LeadStage } from "@/generated/prisma/enums";
import { ActionForm, SubmitButton, fieldError } from "@/components/ui/action-form";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { LocationFields } from "@/components/forms/location-fields";
import { MessageCard, type MessageView } from "@/components/messages/message-card";
import { LOSS_REASON_LABELS, STAGE_LABELS, STAGE_ORDER, TASK_TYPE_LABELS } from "@/data/labels";
import { NICHES } from "@/data/niches";
import {
  addNoteAction,
  changeStageAction,
  createTaskAction,
  doNotContactAction,
  eraseLeadAction,
  optInAction,
  setTaskStatusAction,
  updateLeadAction,
} from "@/server/actions/crm";
import { replyDraftAction } from "@/server/actions/outreach";

export interface LeadEditable {
  id: string;
  name: string;
  category: string | null;
  nicheKey: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
}

export function EditLeadButton({ lead }: { lead: LeadEditable }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil /> Editar
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Editar dados do lead" size="lg">
        <ActionForm action={updateLeadAction.bind(null, lead.id)} onSuccess={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
          {(state) => (
            <>
              <Field label="Nome comercial" htmlFor="name" error={fieldError(state, "name")} required className="sm:col-span-2">
                <Input id="name" name="name" defaultValue={lead.name} />
              </Field>
              <Field label="Categoria" htmlFor="category">
                <Input id="category" name="category" defaultValue={lead.category ?? ""} />
              </Field>
              <Field label="Nicho" htmlFor="nicheKey">
                <Select id="nicheKey" name="nicheKey" defaultValue={lead.nicheKey ?? ""}>
                  <option value="">—</option>
                  {NICHES.map((n) => <option key={n.key} value={n.key}>{n.label}</option>)}
                </Select>
              </Field>
              <LocationFields defaultState={lead.state} defaultCity={lead.city} errors={{ state: fieldError(state, "state"), city: fieldError(state, "city") }} />
              <Field label="Endereço" htmlFor="address"><Input id="address" name="address" defaultValue={lead.address ?? ""} /></Field>
              <Field label="Bairro" htmlFor="neighborhood"><Input id="neighborhood" name="neighborhood" defaultValue={lead.neighborhood ?? ""} /></Field>
              <Field label="Telefone comercial" htmlFor="phone" hint="DDD + número"><Input id="phone" name="phone" defaultValue={lead.phone ?? ""} inputMode="tel" /></Field>
              <Field label="WhatsApp comercial" htmlFor="whatsapp" hint="Somente se informado pela empresa"><Input id="whatsapp" name="whatsapp" defaultValue={lead.whatsapp ?? ""} inputMode="tel" /></Field>
              <Field label="E-mail comercial" htmlFor="email" error={fieldError(state, "email")}><Input id="email" name="email" type="email" defaultValue={lead.email ?? ""} /></Field>
              <Field label="Site" htmlFor="websiteUrl"><Input id="websiteUrl" name="websiteUrl" defaultValue={lead.websiteUrl ?? ""} /></Field>
              <Field label="Instagram" htmlFor="instagramUrl"><Input id="instagramUrl" name="instagramUrl" defaultValue={lead.instagramUrl ?? ""} /></Field>
              <Field label="Facebook" htmlFor="facebookUrl"><Input id="facebookUrl" name="facebookUrl" defaultValue={lead.facebookUrl ?? ""} /></Field>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <SubmitButton>Salvar</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </Dialog>
    </>
  );
}

export function StageForm({ leadId, stage, defaultDealValue }: { leadId: string; stage: LeadStage; defaultDealValue: number }) {
  const [next, setNext] = useState<LeadStage>(stage);
  return (
    <ActionForm action={changeStageAction.bind(null, leadId)} className="space-y-3">
      {(state) => (
        <>
          <Field label="Etapa atual" htmlFor="stage">
            <Select id="stage" name="stage" value={next} onChange={(e) => setNext(e.target.value as LeadStage)}>
              {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s].label}</option>)}
            </Select>
          </Field>
          {next === "LOST" ? (
            <>
              <Field label="Motivo da perda" htmlFor="lossReason" required error={fieldError(state, "lossReason")}>
                <Select id="lossReason" name="lossReason" defaultValue="">
                  <option value="">Selecione…</option>
                  {Object.entries(LOSS_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Detalhes" htmlFor="lossNote"><Input id="lossNote" name="lossNote" /></Field>
            </>
          ) : null}
          {next === "WON" ? (
            <Field label="Valor fechado (R$)" htmlFor="dealValue" hint="Confirme o valor acordado com o cliente.">
              <Input id="dealValue" name="dealValue" defaultValue={defaultDealValue.toFixed(2).replace(".", ",")} inputMode="decimal" />
            </Field>
          ) : null}
          {next === "DO_NOT_CONTACT" ? (
            <Field label="Motivo" htmlFor="note"><Input id="note" name="note" placeholder="Ex.: pediu para não ser contatado" /></Field>
          ) : null}
          <SubmitButton size="sm" variant="secondary" className="w-full" disabled={next === stage}>
            Atualizar etapa
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function TaskList({ tasks }: { tasks: Array<{ id: string; title: string; type: string; dueAt: string; status: string; auto: boolean; overdue: boolean; dueLabel: string }> }) {
  if (tasks.length === 0) return <p className="text-13 text-fg-3">Nenhum próximo passo agendado.</p>;
  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
          <div className="min-w-0 flex-1">
            <p className={t.status !== "OPEN" ? "text-13 text-fg-3 line-through" : "text-13 font-medium"}>{t.title}</p>
            <p className={t.overdue && t.status === "OPEN" ? "text-xs text-danger" : "text-xs text-fg-3"}>
              {TASK_TYPE_LABELS[t.type as keyof typeof TASK_TYPE_LABELS]} · {t.dueLabel}{t.auto ? " · sugerido pelo agente" : ""}
            </p>
          </div>
          {t.status === "OPEN" ? (
            <span className="flex gap-1">
              <ActionButton size="xs" variant="soft" action={setTaskStatusAction.bind(null, t.id, "DONE")}>Concluir</ActionButton>
              <ActionButton size="xs" variant="ghost" action={setTaskStatusAction.bind(null, t.id, "CANCELLED")} aria-label="Cancelar tarefa">✕</ActionButton>
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function TaskForm({ leadId, defaultDate }: { leadId: string; defaultDate: string }) {
  return (
    <ActionForm action={createTaskAction.bind(null, leadId)} resetOnSuccess className="mt-3 grid gap-2 border-t border-border pt-3">
      {(state) => (
        <>
          <Field label="Novo próximo passo" htmlFor="title" error={fieldError(state, "title")}>
            <Input id="title" name="title" placeholder="Ex.: ligar para apresentar a proposta" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Select name="type" aria-label="Tipo" defaultValue="FOLLOW_UP">
              {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input name="dueAt" type="date" defaultValue={defaultDate} aria-label="Data" />
          </div>
          <SubmitButton size="sm" variant="secondary">Agendar</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function NoteForm({ leadId }: { leadId: string }) {
  return (
    <ActionForm action={addNoteAction.bind(null, leadId)} resetOnSuccess className="space-y-2">
      {(state) => (
        <>
          <Field label="Nova observação" htmlFor="body" error={fieldError(state, "body")}>
            <Textarea id="body" name="body" rows={3} placeholder="Ex.: prefere contato depois das 14h" />
          </Field>
          <SubmitButton size="sm" variant="secondary">Adicionar</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function Conversation({
  leadId,
  messages,
  channels,
  integrations,
  canApprove,
  canSend,
  canWrite,
}: {
  leadId: string;
  messages: MessageView[];
  channels: Channel[];
  integrations: Record<Channel, boolean>;
  canApprove: boolean;
  canSend: boolean;
  canWrite: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [formKey, setFormKey] = useState(0);
  const lastInbound = messages.toReversed().find((m) => m.direction === "INBOUND");
  return (
    <div className="space-y-3">
      {messages.length === 0 ? <p className="text-13 text-fg-3">Nenhuma mensagem ainda.</p> : null}
      {messages.map((m) => (
        <MessageCard
          key={m.id}
          message={m}
          integrations={integrations}
          canApprove={canApprove}
          canSend={canSend}
          onUseSuggestion={(text) => {
            setDraft(text);
            setFormKey((k) => k + 1);
          }}
        />
      ))}
      {canWrite && channels.length > 0 ? (
        <ActionForm
          key={formKey}
          action={replyDraftAction.bind(null, leadId)}
          resetOnSuccess
          onSuccess={() => setDraft("")}
          className="rounded-xl border border-dashed border-border-strong p-4"
        >
          <p className="mb-2 text-13 font-medium">Escrever mensagem</p>
          <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
            <Select name="channel" aria-label="Canal" defaultValue={lastInbound?.channel ?? channels[0]}>
              {channels.map((c) => <option key={c} value={c}>{c === "WHATSAPP" ? "WhatsApp" : "E-mail"}</option>)}
            </Select>
            <Input name="subject" placeholder="Assunto (apenas e-mail)" aria-label="Assunto" />
          </div>
          <Textarea name="body" className="mt-2" rows={3} defaultValue={draft} aria-label="Texto" placeholder="Escreva a resposta. Ela entra como rascunho e precisa de aprovação." />
          {lastInbound ? <input type="hidden" name="inReplyToId" value={lastInbound.id} /> : null}
          <div className="mt-2 flex justify-end">
            <SubmitButton size="sm" variant="secondary">Criar rascunho</SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </div>
  );
}

export function ComplianceActions({
  leadId,
  doNotContact,
  optedIn,
  canErase,
}: {
  leadId: string;
  doNotContact: boolean;
  optedIn: boolean;
  canErase: boolean;
}) {
  const [dialog, setDialog] = useState<null | "optin" | "dnc" | "erase">(null);
  const close = () => setDialog(null);
  return (
    <div className="flex flex-col gap-2">
      {!doNotContact && !optedIn ? (
        <Button size="sm" variant="ghost" className="justify-start" onClick={() => setDialog("optin")}>
          <ShieldCheck /> Registrar consentimento (WhatsApp)
        </Button>
      ) : null}
      {!doNotContact ? (
        <Button size="sm" variant="ghost" className="justify-start" onClick={() => setDialog("dnc")}>
          <Ban /> Não contatar novamente
        </Button>
      ) : null}
      {canErase ? (
        <Button size="sm" variant="ghost" className="justify-start text-danger hover:text-danger" onClick={() => setDialog("erase")}>
          <Trash2 /> Excluir dados do lead
        </Button>
      ) : null}

      <Dialog open={dialog === "optin"} onClose={close} title="Registrar consentimento para WhatsApp" description="A Meta exige consentimento (opt-in) para mensagens iniciadas pela empresa via API.">
        <ActionForm action={optInAction.bind(null, leadId)} onSuccess={close} className="space-y-3">
          {(state) => (
            <>
              <Field label="Como o consentimento foi obtido?" htmlFor="note" error={fieldError(state, "note")}>
                <Textarea id="note" name="note" rows={3} placeholder="Ex.: respondeu ao e-mail pedindo contato pelo WhatsApp em 10/11" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Cancelar</Button>
                <SubmitButton>Registrar</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </Dialog>

      <Dialog open={dialog === "dnc"} onClose={close} title="Não contatar novamente" description="O contato entra na lista de supressão e mensagens pendentes são canceladas.">
        <ActionForm action={doNotContactAction.bind(null, leadId)} onSuccess={close} className="space-y-3">
          <Field label="Motivo" htmlFor="reason"><Input id="reason" name="reason" placeholder="Ex.: pediu por telefone" /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>Cancelar</Button>
            <SubmitButton variant="danger">Bloquear contato</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>

      <Dialog open={dialog === "erase"} onClose={close} title="Excluir dados do lead" description="Remove o lead e todo o histórico (mensagens, notas, propostas). Ação irreversível.">
        <ActionForm action={eraseLeadAction.bind(null, leadId)} refresh={false} onSuccess={() => window.location.assign("/leads")} className="space-y-3">
          {(state) => (
            <>
              <p className="text-13 text-fg-2">Para impedir novas abordagens, um código irreversível (hash) do telefone/e-mail é mantido na lista de supressão.</p>
              <Field label="Motivo" htmlFor="erase-reason"><Input id="erase-reason" name="reason" placeholder="Ex.: solicitação do titular (LGPD)" /></Field>
              <Field label="Digite EXCLUIR para confirmar" htmlFor="confirm" error={fieldError(state, "confirm") ?? (state.ok === false ? state.error : undefined)}>
                <Input id="confirm" name="confirm" autoComplete="off" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>Cancelar</Button>
                <SubmitButton variant="danger">Excluir definitivamente</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </Dialog>
    </div>
  );
}
