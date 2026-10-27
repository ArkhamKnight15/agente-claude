import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Download, Mail, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { PROPOSAL_STATUS_LABELS } from "@/data/labels";
import { formatBRL, formatDateTime, toNumber } from "@/lib/format";
import { formatPhone, waMeLink } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { proposalCommandAction } from "@/server/actions/admin";
import { NotFoundError } from "@/server/errors";
import { isSmtpConfigured } from "@/server/integrations/email";
import { can } from "@/server/security/rbac";
import { getProposal, proposalCode } from "@/server/services/proposals";
import { ProposalEditor } from "./proposal-editor";

export const metadata: Metadata = { title: "Proposta" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("proposal:read");
  const { id } = await params;
  const p = await getProposal(id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const status = PROPOSAL_STATUS_LABELS[p.status];
  const cmd = (c: Parameters<typeof proposalCommandAction>[1]) => proposalCommandAction.bind(null, p.id, c);
  const canWrite = can(user.role, "proposal:write");
  const phone = p.lead.whatsappE164 ?? p.lead.phoneE164;

  return (
    <>
      <PageHeader
        breadcrumb={{ href: "/propostas", label: "Propostas" }}
        title={`Proposta ${proposalCode(p.number)} — ${p.lead.name}`}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={status.tone} dot>{status.label}</Badge> {formatBRL(p.price)} · <Link href={`/leads/${p.lead.id}`} className="text-accent hover:underline">ver lead</Link></span>}
        actions={
          <a href={`/api/proposals/${p.id}/pdf`} className={buttonClasses("secondary")} download>
            <Download className="size-4" /> Baixar PDF
          </a>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Conteúdo da proposta" description={p.status === "DRAFT" ? "Editar volta a proposta para rascunho e exige nova aprovação." : "Propostas aprovadas ou enviadas ficam bloqueadas para edição (exceto aprovadas, que voltam a rascunho ao salvar)."} />
          <CardBody>
            <ProposalEditor
              readOnly={!canWrite || !["DRAFT", "APPROVED"].includes(p.status)}
              p={{
                id: p.id, title: p.title, objective: p.objective,
                structure: p.structure as string[], features: p.features as string[], notIncluded: p.notIncluded as string[],
                clientResponsibilities: p.clientResponsibilities as string[], timelineDays: p.timelineDays, price: toNumber(p.price),
                paymentTerms: p.paymentTerms, supportTerms: p.supportTerms, validUntil: p.validUntil.toISOString().slice(0, 10),
                notes: p.notes, followUpMessage: p.followUpMessage,
              }}
            />
          </CardBody>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Próximo passo" />
            <CardBody className="space-y-3">
              {p.lead.doNotContact ? <Alert tone="danger">Este contato pediu para não receber mensagens.</Alert> : null}
              {p.status === "DRAFT" ? (
                can(user.role, "proposal:approve") ? (
                  <ActionButton variant="primary" className="w-full" action={cmd("approve")} confirm={{ title: "Aprovar proposta?", description: `Você confirma o valor de ${formatBRL(p.price)} e as condições descritas. Depois de aprovada, a proposta pode ser enviada.`, confirmLabel: "Aprovar" }}>
                    <CheckCircle2 /> Aprovar proposta
                  </ActionButton>
                ) : (
                  <Alert tone="info">Aguardando aprovação de um administrador.</Alert>
                )
              ) : null}
              {p.status === "APPROVED" && canWrite ? (
                <>
                  {isSmtpConfigured() && p.lead.email ? (
                    <ActionButton variant="primary" className="w-full" action={cmd("send_email")} confirm={{ title: "Enviar por e-mail?", description: `O PDF será enviado para ${p.lead.email} com a mensagem de acompanhamento.`, confirmLabel: "Enviar" }}>
                      <Mail /> Enviar por e-mail (PDF anexo)
                    </ActionButton>
                  ) : (
                    <p className="text-xs text-fg-3">{p.lead.email ? "Configure o SMTP para enviar por e-mail." : "O lead não tem e-mail; envie o PDF manualmente."}</p>
                  )}
                  {phone && !p.lead.isDemo ? (
                    <a href={waMeLink(phone, p.followUpMessage ?? "")} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "md", "w-full")}>
                      <Send className="size-4" /> Abrir WhatsApp ({formatPhone(phone)})
                    </a>
                  ) : null}
                  <ActionButton className="w-full" action={cmd("mark_sent")} confirm={{ title: "Registrar envio manual?", description: "Confirme apenas se você já enviou o PDF ao cliente." }}>
                    Registrar envio manual
                  </ActionButton>
                </>
              ) : null}
              {["SENT", "EXPIRED"].includes(p.status) && canWrite ? (
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton variant="primary" action={cmd("accepted")} confirm={{ title: "Registrar venda fechada?", description: `O lead irá para “Venda fechada” com valor de ${formatBRL(p.price)}. Faça isso somente após o aceite do cliente.`, confirmLabel: "Registrar venda" }}>
                    <ThumbsUp /> Aceita
                  </ActionButton>
                  <ActionButton action={cmd("rejected")}><ThumbsDown /> Recusada</ActionButton>
                </div>
              ) : null}
              {p.status === "ACCEPTED" ? <Alert tone="success">Proposta aceita — venda registrada.</Alert> : null}
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-1.5 text-13 text-fg-2">
              <p>Criada em {formatDateTime(p.createdAt)}</p>
              {p.approvedAt ? <p>Aprovada por {p.approvedBy?.name ?? "—"} em {formatDateTime(p.approvedAt)}</p> : null}
              {p.sentAt ? <p>Enviada ({p.sentVia}) em {formatDateTime(p.sentAt)}</p> : null}
              <p>Válida até {formatDateTime(p.validUntil)}</p>
              <p className="pt-2 text-xs text-fg-3">O agente prepara a proposta, mas não fecha contratos nem assume compromissos financeiros sem sua confirmação.</p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
