import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, PageHeader } from "@/components/ui/misc";
import { COST_CATEGORY_LABELS } from "@/data/labels";
import { formatBRL, formatDate } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { addSuppressionAction, purgeDemoDataAction } from "@/server/actions/admin";
import { addCostAction, deleteCostAction } from "@/server/actions/outreach";
import { db } from "@/server/db";
import { can } from "@/server/security/rbac";

export const metadata: Metadata = { title: "Dados e LGPD" };

export default async function DataPage() {
  const user = await requireUser("settings:read");
  const [suppressed, demo, costs, doNotContact] = await Promise.all([
    db.suppressionEntry.groupBy({ by: ["source"], _count: true }),
    db.lead.count({ where: { isDemo: true } }),
    db.cost.findMany({ orderBy: { date: "desc" }, take: 50 }),
    db.lead.count({ where: { doNotContact: true } }),
  ]);
  const totalSuppressed = suppressed.reduce((s, r) => s + r._count, 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Dados e LGPD" description="Lista de supressão, custos, dados de demonstração e orientações de proteção de dados." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Lista de supressão (não contatar)" description={`${totalSuppressed} contato(s) bloqueado(s) · ${doNotContact} lead(s) marcados como “não contatar”.`} />
          <CardBody className="space-y-4">
            <p className="text-13 text-fg-2">
              Pedidos de interrupção recebidos por WhatsApp, e-mail ou link de descadastro entram aqui automaticamente. Armazenamos apenas um código irreversível (HMAC) do telefone/e-mail, que continua bloqueando novos contatos mesmo após a exclusão dos dados.
            </p>
            {can(user.role, "lead:write") ? (
              <ActionForm action={addSuppressionAction} resetOnSuccess className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Field label="Telefone ou e-mail" htmlFor="value"><Input id="value" name="value" placeholder="(11) 98765-4321 ou email@empresa.com" /></Field>
                <Field label="Motivo" htmlFor="reason"><Input id="reason" name="reason" placeholder="Pedido por telefone" /></Field>
                <SubmitButton variant="secondary">Bloquear</SubmitButton>
              </ActionForm>
            ) : null}
            <ul className="text-xs text-fg-3">{suppressed.map((s) => <li key={s.source}>{s.source}: {s._count}</li>)}</ul>
          </CardBody>
        </Card>

        <Card id="custos">
          <CardHeader title="Custos" description="Usados para calcular o custo por cliente no dashboard." />
          <CardBody className="space-y-4">
            {can(user.role, "cost:write") ? (
              <ActionForm action={addCostAction} resetOnSuccess className="grid gap-2 sm:grid-cols-2">
                <Field label="Descrição" htmlFor="description"><Input id="description" name="description" placeholder="Créditos Google Places" /></Field>
                <Field label="Categoria" htmlFor="category"><Select id="category" name="category" defaultValue="API">{Object.entries(COST_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
                <Field label="Valor (R$)" htmlFor="amount"><Input id="amount" name="amount" inputMode="decimal" placeholder="0,00" /></Field>
                <Field label="Data" htmlFor="date"><Input id="date" name="date" type="date" defaultValue={today} /></Field>
                <SubmitButton variant="secondary" className="sm:col-span-2">Registrar custo</SubmitButton>
              </ActionForm>
            ) : null}
            <ul className="divide-y divide-border text-13">
              {costs.length === 0 ? <li className="py-2 text-fg-3">Nenhum custo registrado.</li> : null}
              {costs.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate">{c.description} <span className="text-fg-3">· {COST_CATEGORY_LABELS[c.category]} · {formatDate(c.date)}</span></span>
                  <span className="font-medium tabular-nums">{formatBRL(c.amount)}</span>
                  {can(user.role, "cost:write") ? <ActionButton size="xs" variant="ghost" action={deleteCostAction.bind(null, c.id)} aria-label="Remover custo"><Trash2 /></ActionButton> : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Dados de demonstração" description={demo ? `${demo} lead(s) fictícios marcados como demonstração.` : "Nenhum dado de demonstração."} />
          <CardBody className="space-y-3">
            <p className="text-13 text-fg-2">Criados apenas pelo comando <code className="font-mono text-xs">npm run db:seed:demo</code>. Envios reais para eles são bloqueados.</p>
            {demo && can(user.role, "settings:write") ? (
              <ActionButton variant="danger" action={purgeDemoDataAction} confirm={{ title: "Remover dados de demonstração?", description: "Remove todos os leads, mensagens, propostas e campanhas marcados como demonstração. Dados reais não são afetados.", confirmLabel: "Remover", tone: "danger" }}>
                <Trash2 /> Remover dados de demonstração
              </ActionButton>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Proteção de dados (LGPD)" />
          <CardBody>
            <ul className="space-y-2 text-13 text-fg-2">
              <li>• Coletamos apenas dados comerciais públicos (nome, telefone e e-mail comerciais, endereço, redes e site). Nenhum dado sensível.</li>
              <li>• Base legal sugerida: legítimo interesse para contato B2B — registre sua avaliação (LIA) e ofereça opt-out em todo contato.</li>
              <li>• Na ficha do lead: exportar todos os dados (JSON) e excluir definitivamente a pedido do titular.</li>
              <li>• Leads nunca contatados são excluídos automaticamente após o prazo de retenção configurado.</li>
              <li>• Logs mascaram telefones, e-mails e segredos; ações relevantes ficam na auditoria (Tarefas e erros).</li>
              <li>• Backups: use <code className="font-mono text-xs">scripts/backup.sh</code> diariamente e teste a restauração (veja o README).</li>
            </ul>
            <Alert tone="info" className="mt-4">Este sistema ajuda na conformidade, mas não substitui a orientação de um profissional jurídico.</Alert>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
