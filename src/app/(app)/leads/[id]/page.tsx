import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Download, ExternalLink, FileText, Mail, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, KeyValue, NotFound, PageHeader } from "@/components/ui/misc";
import { PriorityBadge, StageBadge, WebsiteBadge } from "@/components/shared/status-badges";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { CONFIDENCE_LABELS, PROPOSAL_STATUS_LABELS, PROVIDER_LABELS } from "@/data/labels";
import { getNiche } from "@/data/niches";
import type { StoredAnalysis } from "@/lib/agent/lead-facts";
import type { ScoreFactor } from "@/lib/agent/scoring";
import type { EvidenceItem } from "@/lib/agent/website-analysis";
import { formatBRL, formatDate, formatDateTime, formatRelative, toNumber } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { requireUser } from "@/server/auth/session";
import { createProposalAction } from "@/server/actions/admin";
import { draftMessageAction, regenerateAnalysisAction, rescoreLeadAction, reverifyLeadAction } from "@/server/actions/crm";
import { availableChannels } from "@/server/agent/lead-agent";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { can } from "@/server/security/rbac";
import { getLeadDetail } from "@/server/services/leads";
import { integrationConfiguredFor } from "@/server/services/messages";
import { getDefaultPackage } from "@/server/services/settings";
import { toMessageView } from "@/server/views";
import { ComplianceActions, Conversation, EditLeadButton, NoteForm, StageForm, TaskForm, TaskList } from "./lead-panels";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const lead = await db.lead.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: lead?.name ?? "Lead" };
}

function ExternalValue({ href, children }: { href: string | null; children?: React.ReactNode }) {
  if (!href) return <NotFound />;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 text-accent hover:underline">
      <span className="truncate">{children ?? href.replace(/^https?:\/\/(www\.)?/, "")}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("lead:read");
  const { id } = await params;
  const lead = await getLeadDetail(id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const pendingJob = await db.job.findFirst({ where: { leadId: id, type: "lead.process", status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true } });
  const pkg = await getDefaultPackage();
  const analysis = (lead.analysis ?? null) as StoredAnalysis | null;
  const breakdown = (lead.scoreBreakdown ?? null) as { factors: ScoreFactor[]; caps: string[]; summary: string } | null;
  const check = lead.websiteChecks[0];
  const channels = availableChannels(lead);
  const integrations = { WHATSAPP: integrationConfiguredFor("WHATSAPP"), EMAIL: integrationConfiguredFor("EMAIL") };
  const canWrite = can(user.role, "lead:write");
  const canMessage = can(user.role, "message:write");
  const now = Date.now();

  return (
    <>
      <AutoRefresh active={Boolean(pendingJob)} seconds={4} />
      <PageHeader
        breadcrumb={{ href: "/leads", label: "Leads" }}
        title={lead.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{getNiche(lead.nicheKey)?.label ?? lead.category ?? "Sem categoria"} · {lead.city}/{lead.state}</span>
            <StageBadge stage={lead.stage} />
            <PriorityBadge priority={lead.priority} score={lead.score} />
            <WebsiteBadge status={lead.websiteStatus} confidence={lead.websiteConfidence} />
            {lead.isDemo ? <Badge tone="warning">Demonstração</Badge> : null}
          </span>
        }
        actions={
          <>
            {canMessage && channels.includes("WHATSAPP") && !lead.doNotContact ? (
              <ActionButton size="sm" action={draftMessageAction.bind(null, lead.id, "WHATSAPP")}><MessageCircle /> Preparar WhatsApp</ActionButton>
            ) : null}
            {canMessage && channels.includes("EMAIL") && !lead.doNotContact ? (
              <ActionButton size="sm" action={draftMessageAction.bind(null, lead.id, "EMAIL")}><Mail /> Preparar e-mail</ActionButton>
            ) : null}
            {can(user.role, "proposal:write") && !lead.doNotContact ? (
              <ActionButton size="sm" variant="primary" action={createProposalAction.bind(null, lead.id)}><FileText /> Criar proposta</ActionButton>
            ) : null}
          </>
        }
      />

      {lead.doNotContact ? (
        <Alert tone="danger" className="mb-6" title="Não contatar novamente">
          {lead.doNotContactReason ?? "Este contato pediu para não receber mensagens."} Novos envios estão bloqueados.
        </Alert>
      ) : null}
      {pendingJob ? (
        <Alert tone="info" className="mb-6" title="Verificação em andamento">
          O agente está verificando o site e qualificando este lead. A página atualiza sozinha.
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Análise do agente"
              description={analysis ? `${analysis.generatedBy.startsWith("ai:") ? "Gerada por IA" : "Modelo padrão (sem IA)"} · ${formatRelative(analysis.generatedAt)}` : "Ainda não gerada."}
              action={canMessage ? <ActionButton size="sm" variant="ghost" action={regenerateAnalysisAction.bind(null, lead.id)}><Sparkles /> {analysis ? "Gerar novamente" : "Gerar análise"}</ActionButton> : null}
            />
            {analysis ? (
              <CardBody className="space-y-4">
                {analysis.aiError ? <Alert tone="warning">IA indisponível na última geração: {analysis.aiError}</Alert> : null}
                <dl className="grid gap-4 sm:grid-cols-2">
                  <KeyValue label="Motivo da classificação">{analysis.classificationReason}</KeyValue>
                  <KeyValue label="Necessidade identificada">{analysis.identifiedNeed}</KeyValue>
                  <KeyValue label="Argumento de venda">{analysis.salesArgument}</KeyValue>
                  <KeyValue label="Próxima ação recomendada">{analysis.nextAction}</KeyValue>
                </dl>
                <div>
                  <p className="text-xs text-fg-3">Benefícios que um site pode oferecer</p>
                  <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    {analysis.benefits.map((b) => (
                      <li key={b} className="flex gap-2 text-13 text-fg-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-accent" aria-hidden />{b}</li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-fg-3">A pontuação e a análise são estimativas baseadas nos dados disponíveis, não certezas sobre o interesse do cliente.</p>
              </CardBody>
            ) : null}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Pontuação"
                description={breakdown ? `${lead.score}/100 · calculada ${formatRelative(lead.scoredAt)}` : "Ainda não calculada."}
                action={canWrite ? <ActionButton size="sm" variant="ghost" action={rescoreLeadAction.bind(null, lead.id)}>Recalcular</ActionButton> : null}
              />
              {breakdown ? (
                <CardBody>
                  <ul className="space-y-3">
                    {breakdown.factors.map((f) => (
                      <li key={f.key}>
                        <div className="flex justify-between gap-2 text-13">
                          <span className="font-medium">{f.label}</span>
                          <span className="tabular-nums text-fg-2">{f.points}/{f.max}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                          <div className="h-full rounded-full bg-series-1" style={{ width: `${(f.points / f.max) * 100}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-fg-3">{f.detail}</p>
                      </li>
                    ))}
                  </ul>
                  {breakdown.caps.length ? <p className="mt-3 text-xs text-warning">{breakdown.caps.join(" ")}</p> : null}
                </CardBody>
              ) : null}
            </Card>

            <Card>
              <CardHeader
                title="Verificação de site"
                description={check ? `${CONFIDENCE_LABELS[check.confidence].label} · ${formatDateTime(check.checkedAt)}${check.searchProvider ? ` · ${check.searchProvider}` : ""}` : "Ainda não verificado."}
                action={canWrite ? <ActionButton size="sm" variant="ghost" action={reverifyLeadAction.bind(null, lead.id)}><RefreshCw /> Verificar</ActionButton> : null}
              />
              <CardBody>
                {check ? (
                  <>
                    <p className="text-13 font-medium">{check.summary}</p>
                    {(check.issues as string[] | null)?.length ? (
                      <ul className="mt-2 space-y-1">
                        {(check.issues as string[]).map((i) => (
                          <li key={i} className="flex gap-1.5 text-xs text-warning"><AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />{i}</li>
                        ))}
                      </ul>
                    ) : null}
                    <details className="mt-3 group">
                      <summary className="cursor-pointer text-13 text-accent">Ver evidências ({(check.evidence as unknown as EvidenceItem[]).length})</summary>
                      <ol className="mt-2 space-y-2 border-l border-border pl-3">
                        {(check.evidence as unknown as EvidenceItem[]).map((e, i) => (
                          <li key={i} className="text-xs text-fg-2">
                            {e.query ? <span className="font-mono text-fg-3">“{e.query}” — </span> : null}
                            {e.message}
                            {e.url ? <> <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent hover:underline">{e.url}</a></> : null}
                          </li>
                        ))}
                      </ol>
                    </details>
                  </>
                ) : (
                  <p className="text-13 text-fg-3">Clique em Verificar para pesquisar o site da empresa.</p>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Mensagens" description="Toda mensagem passa por aprovação antes do envio." />
            <CardBody>
              <Conversation
                leadId={lead.id}
                messages={lead.messages.map(toMessageView)}
                channels={lead.doNotContact ? [] : channels}
                integrations={integrations}
                canApprove={can(user.role, "message:approve")}
                canSend={can(user.role, "message:send")}
                canWrite={canMessage}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Histórico" description="Ações do sistema, do agente e da equipe." />
            <ol className="divide-y divide-border">
              {lead.activities.map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-2.5 text-13">
                  <Badge tone={a.actorType === "AGENT" ? "accent" : a.actorType === "USER" ? "info" : "neutral"} className="shrink-0">
                    {a.actorType === "AGENT" ? "Agente" : a.actorType === "USER" ? "Equipe" : "Sistema"}
                  </Badge>
                  <span className="min-w-0 flex-1 text-fg-2">{a.description}</span>
                  <time className="shrink-0 text-xs text-fg-3" dateTime={a.createdAt.toISOString()}>{formatDateTime(a.createdAt)}</time>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader
              title="Dados da empresa"
              action={canWrite ? (
                <EditLeadButton
                  lead={{
                    id: lead.id, name: lead.name, category: lead.category, nicheKey: lead.nicheKey, address: lead.address, neighborhood: lead.neighborhood,
                    city: lead.city, state: lead.state, phone: lead.phone, whatsapp: lead.whatsappE164 ? formatPhone(lead.whatsappE164) : null, email: lead.email,
                    instagramUrl: lead.instagramUrl, facebookUrl: lead.facebookUrl, websiteUrl: lead.websiteUrl,
                  }}
                />
              ) : null}
            />
            <CardBody>
              <dl className="grid gap-3.5">
                <KeyValue label="Endereço">{lead.address ?? <NotFound />}</KeyValue>
                <KeyValue label="Telefone">{lead.phoneE164 ? `${formatPhone(lead.phoneE164)}${lead.phoneType === "MOBILE" ? " (celular)" : ""}` : <NotFound />}</KeyValue>
                <KeyValue label="WhatsApp">{lead.whatsappE164 ? `${formatPhone(lead.whatsappE164)} · fonte: ${lead.whatsappSource ?? "—"}` : <NotFound>não informado pela empresa</NotFound>}</KeyValue>
                <KeyValue label="E-mail">{lead.email ? `${lead.email}${lead.emailSource ? ` · fonte: ${lead.emailSource}` : ""}` : <NotFound />}</KeyValue>
                <KeyValue label="Site"><ExternalValue href={lead.websiteUrl} /></KeyValue>
                <KeyValue label="Instagram"><ExternalValue href={lead.instagramUrl} /></KeyValue>
                <KeyValue label="Facebook"><ExternalValue href={lead.facebookUrl} /></KeyValue>
                <KeyValue label="Google Maps"><ExternalValue href={lead.googleMapsUrl}>Abrir no mapa</ExternalValue></KeyValue>
                <KeyValue label="Avaliações">{lead.reviewCount !== null ? `${lead.reviewCount} · nota ${lead.rating?.toFixed(1) ?? "—"}` : <NotFound />}</KeyValue>
                <KeyValue label="Fontes">
                  {lead.sources.length ? lead.sources.map((s) => (
                    <span key={s.id} className="block text-13">
                      {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">{PROVIDER_LABELS[s.provider]}</a> : PROVIDER_LABELS[s.provider]}{" "}
                      <span className="text-fg-3">· {formatDate(s.fetchedAt)}</span>
                    </span>
                  )) : PROVIDER_LABELS[lead.primarySource]}
                </KeyValue>
                <KeyValue label="Última verificação dos dados">{formatDateTime(lead.lastVerifiedAt)}</KeyValue>
              </dl>
            </CardBody>
          </Card>

          {canWrite ? (
            <Card>
              <CardHeader title="Funil" description={`Desde ${formatDate(lead.stageChangedAt)}${lead.dealValue ? ` · ${formatBRL(lead.dealValue)}` : ""}`} />
              <CardBody>
                <StageForm leadId={lead.id} stage={lead.stage} defaultDealValue={toNumber(lead.dealValue) || pkg?.price || 500} />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Próximos passos" />
            <CardBody>
              <TaskList
                tasks={lead.tasks.map((t) => ({
                  id: t.id, title: t.title, type: t.type, dueAt: t.dueAt.toISOString(), status: t.status, auto: t.auto,
                  overdue: t.dueAt.getTime() < now, dueLabel: formatDate(t.dueAt),
                }))}
              />
              {canWrite ? <TaskForm leadId={lead.id} defaultDate={new Date(now + 2 * 86400_000).toISOString().slice(0, 10)} /> : null}
            </CardBody>
          </Card>

          {lead.proposals.length ? (
            <Card>
              <CardHeader title="Propostas" />
              <ul className="divide-y divide-border">
                {lead.proposals.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-5 py-3 text-13">
                    <Link href={`/propostas/${p.id}`} className="font-medium hover:text-accent">#{String(p.number).padStart(4, "0")} · {formatBRL(p.price)}</Link>
                    <Badge tone={PROPOSAL_STATUS_LABELS[p.status].tone}>{PROPOSAL_STATUS_LABELS[p.status].label}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Observações" />
            <CardBody className="space-y-4">
              {canWrite ? <NoteForm leadId={lead.id} /> : null}
              {lead.notes.map((n) => (
                <div key={n.id} className="border-t border-border pt-3 text-13">
                  <p className="whitespace-pre-wrap text-fg-2">{n.body}</p>
                  <p className="mt-1 text-xs text-fg-3">{n.author?.name ?? "—"} · {formatDateTime(n.createdAt)}</p>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Privacidade e consentimento" description={lead.whatsappOptInAt ? `Opt-in WhatsApp em ${formatDate(lead.whatsappOptInAt)}: ${lead.whatsappOptInNote}` : "Sem opt-in de WhatsApp registrado."} />
            <CardBody className="space-y-2">
              {can(user.role, "lead:export") ? (
                <a href={`/api/leads/${lead.id}/export`} className={buttonClasses("ghost", "sm", "w-full justify-start")} download>
                  <Download className="size-4" /> Exportar dados (JSON)
                </a>
              ) : null}
              {canWrite ? (
                <ComplianceActions leadId={lead.id} doNotContact={lead.doNotContact} optedIn={Boolean(lead.whatsappOptInAt)} canErase={can(user.role, "lead:delete")} />
              ) : null}
            </CardBody>
          </Card>

          {lead.campaignLeads.length ? (
            <p className="text-xs text-fg-3">
              Campanhas:{" "}
              {lead.campaignLeads.map((cl, i) => (
                <span key={cl.campaignId}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/campanhas/${cl.campaignId}`} className="text-accent hover:underline">{cl.campaign.name}</Link>
                  {cl.skipReason ? ` (${cl.skipReason})` : ""}
                </span>
              ))}
            </p>
          ) : null}
          <ButtonLink href="/leads" variant="ghost" size="sm">← Voltar para leads</ButtonLink>
        </aside>
      </div>
    </>
  );
}
