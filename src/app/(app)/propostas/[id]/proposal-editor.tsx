"use client";

import { ActionForm, SubmitButton, fieldError } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/form";
import { saveProposalAction } from "@/server/actions/admin";

export interface ProposalFormValues {
  id: string;
  title: string;
  objective: string;
  structure: string[];
  features: string[];
  notIncluded: string[];
  clientResponsibilities: string[];
  timelineDays: number;
  price: number;
  paymentTerms: string;
  supportTerms: string;
  validUntil: string;
  notes: string | null;
  followUpMessage: string | null;
}

export function ProposalEditor({ p, readOnly }: { p: ProposalFormValues; readOnly: boolean }) {
  const list = (items: string[]) => items.join("\n");
  return (
    <ActionForm action={saveProposalAction.bind(null, p.id)} className="grid gap-4 sm:grid-cols-2">
      {(state) => (
        <fieldset disabled={readOnly} className="contents">
          <Field label="Título" htmlFor="title" error={fieldError(state, "title")} className="sm:col-span-2"><Input id="title" name="title" defaultValue={p.title} /></Field>
          <Field label="Objetivo do site" htmlFor="objective" error={fieldError(state, "objective")} className="sm:col-span-2"><Textarea id="objective" name="objective" rows={3} defaultValue={p.objective} /></Field>
          <Field label="Estrutura sugerida" htmlFor="structure" hint="Uma seção por linha"><Textarea id="structure" name="structure" rows={6} defaultValue={list(p.structure)} /></Field>
          <Field label="Funcionalidades incluídas" htmlFor="features" hint="Uma por linha"><Textarea id="features" name="features" rows={6} defaultValue={list(p.features)} /></Field>
          <Field label="Itens não incluídos" htmlFor="notIncluded" hint="Uma por linha"><Textarea id="notIncluded" name="notIncluded" rows={5} defaultValue={list(p.notIncluded)} /></Field>
          <Field label="Responsabilidades do cliente" htmlFor="clientResponsibilities" hint="Uma por linha"><Textarea id="clientResponsibilities" name="clientResponsibilities" rows={5} defaultValue={list(p.clientResponsibilities)} /></Field>
          <Field label="Preço (R$)" htmlFor="price" error={fieldError(state, "price")}><Input id="price" name="price" inputMode="decimal" defaultValue={p.price.toFixed(2).replace(".", ",")} /></Field>
          <Field label="Prazo (dias úteis)" htmlFor="timelineDays"><Input id="timelineDays" name="timelineDays" type="number" min={1} defaultValue={p.timelineDays} /></Field>
          <Field label="Condições de pagamento" htmlFor="paymentTerms"><Textarea id="paymentTerms" name="paymentTerms" rows={2} defaultValue={p.paymentTerms} /></Field>
          <Field label="Suporte e manutenção" htmlFor="supportTerms"><Textarea id="supportTerms" name="supportTerms" rows={2} defaultValue={p.supportTerms} /></Field>
          <Field label="Válida até" htmlFor="validUntil" error={fieldError(state, "validUntil")}><Input id="validUntil" name="validUntil" type="date" defaultValue={p.validUntil} /></Field>
          <Field label="Observações (aparece no PDF)" htmlFor="notes"><Input id="notes" name="notes" defaultValue={p.notes ?? ""} /></Field>
          <Field label="Mensagem de acompanhamento" htmlFor="followUpMessage" hint="Texto usado no e-mail/WhatsApp ao enviar a proposta." className="sm:col-span-2">
            <Textarea id="followUpMessage" name="followUpMessage" rows={3} defaultValue={p.followUpMessage ?? ""} />
          </Field>
          {!readOnly ? <div className="flex justify-end sm:col-span-2"><SubmitButton>Salvar rascunho</SubmitButton></div> : null}
        </fieldset>
      )}
    </ActionForm>
  );
}
