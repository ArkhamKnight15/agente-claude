"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { ActionForm, SubmitButton, fieldError } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { savePackageAction } from "@/server/actions/admin";

export interface PackageValues {
  id: string;
  name: string;
  description: string;
  price: number;
  deliveryDays: number;
  revisions: number;
  features: string[];
  notIncluded: string[];
  clientResponsibilities: string[];
  paymentTerms: string;
  supportTerms: string;
  isDefault: boolean;
  active: boolean;
}

export function PackageDialog({ pkg }: { pkg?: PackageValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={pkg ? "ghost" : "primary"} onClick={() => setOpen(true)}>
        {pkg ? <><Pencil /> Editar</> : <><Plus /> Novo pacote</>}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={pkg ? `Editar “${pkg.name}”` : "Novo pacote"} size="lg"
        description="Mensagens e propostas usam o pacote padrão. Itens não incluídos nunca são prometidos pelo agente.">
        <ActionForm action={savePackageAction.bind(null, pkg?.id ?? null)} onSuccess={() => setOpen(false)} className="grid gap-4 sm:grid-cols-2">
          {(state) => (
            <>
              <Field label="Nome" htmlFor="name" error={fieldError(state, "name")} required><Input id="name" name="name" defaultValue={pkg?.name} /></Field>
              <Field label="Preço (R$)" htmlFor="price" error={fieldError(state, "price")} required><Input id="price" name="price" inputMode="decimal" defaultValue={pkg ? pkg.price.toFixed(2).replace(".", ",") : "500,00"} /></Field>
              <Field label="Descrição" htmlFor="description" error={fieldError(state, "description")} className="sm:col-span-2"><Textarea id="description" name="description" rows={2} defaultValue={pkg?.description} /></Field>
              <Field label="Prazo (dias úteis)" htmlFor="deliveryDays" error={fieldError(state, "deliveryDays")}><Input id="deliveryDays" name="deliveryDays" type="number" min={1} defaultValue={pkg?.deliveryDays ?? 10} /></Field>
              <Field label="Rodadas de ajustes" htmlFor="revisions"><Input id="revisions" name="revisions" type="number" min={0} defaultValue={pkg?.revisions ?? 2} /></Field>
              <Field label="Incluído (um por linha)" htmlFor="features" error={fieldError(state, "features")}><Textarea id="features" name="features" rows={6} defaultValue={pkg?.features.join("\n")} /></Field>
              <Field label="Não incluído (um por linha)" htmlFor="notIncluded"><Textarea id="notIncluded" name="notIncluded" rows={6} defaultValue={pkg?.notIncluded.join("\n")} /></Field>
              <Field label="Responsabilidades do cliente" htmlFor="clientResponsibilities" className="sm:col-span-2"><Textarea id="clientResponsibilities" name="clientResponsibilities" rows={3} defaultValue={pkg?.clientResponsibilities.join("\n")} /></Field>
              <Field label="Condições de pagamento" htmlFor="paymentTerms" error={fieldError(state, "paymentTerms")}><Textarea id="paymentTerms" name="paymentTerms" rows={2} defaultValue={pkg?.paymentTerms} /></Field>
              <Field label="Suporte e manutenção" htmlFor="supportTerms" error={fieldError(state, "supportTerms")}><Textarea id="supportTerms" name="supportTerms" rows={2} defaultValue={pkg?.supportTerms} /></Field>
              <Checkbox name="isDefault" defaultChecked={pkg?.isDefault ?? false} label="Pacote padrão" description="Usado nas mensagens e novas propostas." />
              <Checkbox name="active" defaultChecked={pkg?.active ?? true} label="Ativo" />
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <SubmitButton>Salvar pacote</SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </Dialog>
    </>
  );
}
