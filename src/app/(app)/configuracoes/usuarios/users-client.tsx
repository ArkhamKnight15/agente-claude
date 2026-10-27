"use client";

import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { ActionForm, SubmitButton, fieldError } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { ROLE_LABELS } from "@/data/labels";
import { createUserAction, updateUserAction } from "@/server/actions/admin";

function RoleSelect({ defaultValue }: { defaultValue?: Role }) {
  return (
    <Field label="Papel" htmlFor="role" hint="Operadores aprovam mensagens; somente administradores aprovam propostas e mudam configurações.">
      <Select id="role" name="role" defaultValue={defaultValue ?? "OPERATOR"}>
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r].label}</option>)}
      </Select>
    </Field>
  );
}

export function NewUserButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}><UserPlus /> Novo usuário</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Novo usuário">
        <ActionForm action={createUserAction} onSuccess={() => setOpen(false)} className="space-y-4">
          {(state) => (
            <>
              <Field label="Nome" htmlFor="name" error={fieldError(state, "name")}><Input id="name" name="name" /></Field>
              <Field label="E-mail" htmlFor="email" error={fieldError(state, "email")}><Input id="email" name="email" type="email" /></Field>
              <RoleSelect />
              <Field label="Senha inicial" htmlFor="password" error={fieldError(state, "password")} hint="Mínimo de 10 caracteres com letras, números ou símbolos."><Input id="password" name="password" type="password" autoComplete="new-password" /></Field>
              <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><SubmitButton>Criar usuário</SubmitButton></div>
            </>
          )}
        </ActionForm>
      </Dialog>
    </>
  );
}

export function EditUserButton({ user }: { user: { id: string; name: string; role: Role; active: boolean } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Editar ${user.name}`}><Pencil /> Editar</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Editar ${user.name}`}>
        <ActionForm action={updateUserAction.bind(null, user.id)} onSuccess={() => setOpen(false)} className="space-y-4">
          <RoleSelect defaultValue={user.role} />
          <Checkbox name="active" defaultChecked={user.active} label="Usuário ativo" description="Desativar encerra as sessões abertas." />
          <Field label="Nova senha (opcional)" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="new-password" /></Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><SubmitButton>Salvar</SubmitButton></div>
        </ActionForm>
      </Dialog>
    </>
  );
}
