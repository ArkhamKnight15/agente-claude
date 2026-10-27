"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, Check, ExternalLink, Mail, MessageCircle, Pencil, RotateCcw, Send, Sparkles, User, X } from "lucide-react";
import type { Channel, MessageStatus, MessagePurpose, ReplyClassification } from "@/generated/prisma/enums";
import { ActionButton } from "@/components/ui/action-button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { MESSAGE_PURPOSE_LABELS, MESSAGE_STATUS_LABELS, REPLY_CLASSIFICATION_LABELS } from "@/data/labels";
import { formatDateTime } from "@/lib/format";
import { formatPhone, waMeLink } from "@/lib/phone";
import { cn } from "@/lib/cn";
import { messageCommandAction, saveDraftAction } from "@/server/actions/outreach";

export interface MessageView {
  id: string;
  channel: Channel;
  direction: "OUTBOUND" | "INBOUND";
  status: MessageStatus;
  purpose: MessagePurpose;
  subject: string | null;
  body: string;
  toAddress: string | null;
  fromAddress: string | null;
  variant: string | null;
  generatedBy: string | null;
  warnings: string[];
  error: string | null;
  sendMethod: "API" | "MANUAL" | null;
  templateName: string | null;
  scheduledFor: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  approvedByName: string | null;
  classification: ReplyClassification | null;
  classificationSummary: string | null;
  suggestedReply: string | null;
  lead?: { id: string; name: string; city: string; state: string; isDemo: boolean };
}

function origin(generatedBy: string | null) {
  if (!generatedBy) return null;
  if (generatedBy.startsWith("ai:")) return { icon: Sparkles, label: "Gerada por IA" };
  if (generatedBy === "user") return { icon: User, label: "Escrita por você" };
  return { icon: Bot, label: "Modelo padrão (sem IA)" };
}

export function MessageCard({
  message,
  integrations,
  canApprove,
  canSend,
  onUseSuggestion,
  showLead = false,
}: {
  message: MessageView;
  integrations: Record<Channel, boolean>;
  canApprove: boolean;
  canSend: boolean;
  onUseSuggestion?: (text: string) => void;
  showLead?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const m = message;
  const status = MESSAGE_STATUS_LABELS[m.status];
  const ChannelIcon = m.channel === "WHATSAPP" ? MessageCircle : Mail;
  const inbound = m.direction === "INBOUND";
  const src = origin(m.generatedBy);
  const apiReady = integrations[m.channel];
  const manualHref =
    m.toAddress && !m.lead?.isDemo
      ? m.channel === "WHATSAPP"
        ? waMeLink(m.toAddress, m.body)
        : `mailto:${m.toAddress}?subject=${encodeURIComponent(m.subject ?? "")}&body=${encodeURIComponent(m.body)}`
      : null;
  const cmd = (command: Parameters<typeof messageCommandAction>[1], r?: string) => messageCommandAction.bind(null, m.id, command, r);

  return (
    <article
      className={cn(
        "rounded-xl border bg-surface p-4 shadow-xs",
        inbound ? "border-success/25" : m.status === "FAILED" ? "border-danger/30" : "border-border",
      )}
      aria-label={`${inbound ? "Mensagem recebida" : "Mensagem"} por ${m.channel === "WHATSAPP" ? "WhatsApp" : "e-mail"}`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <ChannelIcon className="size-4 text-fg-3" aria-hidden />
        <span className="text-13 font-medium">{inbound ? "Resposta recebida" : MESSAGE_PURPOSE_LABELS[m.purpose]}</span>
        {showLead && m.lead ? (
          <Link href={`/leads/${m.lead.id}`} className="text-13 text-accent hover:underline">
            {m.lead.name} <span className="text-fg-3">· {m.lead.city}/{m.lead.state}</span>
          </Link>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {m.variant ? <Badge>Variante {m.variant}</Badge> : null}
          {inbound && m.classification ? (
            <Badge tone={REPLY_CLASSIFICATION_LABELS[m.classification].tone}>{REPLY_CLASSIFICATION_LABELS[m.classification].label}</Badge>
          ) : null}
          <Badge tone={status.tone} dot>{status.label}</Badge>
        </span>
      </header>

      {editing ? (
        <ActionForm action={saveDraftAction.bind(null, m.id)} onSuccess={() => setEditing(false)} className="space-y-2">
          {m.channel === "EMAIL" ? (
            <Input name="subject" defaultValue={m.subject ?? ""} aria-label="Assunto" placeholder="Assunto" />
          ) : null}
          <Textarea name="body" defaultValue={m.body} rows={8} aria-label="Texto da mensagem" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
            <SubmitButton size="sm">Salvar rascunho</SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <>
          {m.subject ? <p className="mb-1 text-13 font-medium">Assunto: {m.subject}</p> : null}
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg-2">{m.body}</p>
        </>
      )}

      {m.templateName ? (
        <p className="mt-2 text-xs text-fg-3">
          Enviada como modelo aprovado “{m.templateName}” (o cliente recebeu o texto do modelo, não o rascunho acima).
        </p>
      ) : null}

      {m.warnings.length && !inbound ? (
        <ul className="mt-3 space-y-1 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          {m.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      ) : null}
      {m.error ? <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">{m.error}</p> : null}
      {inbound && m.classificationSummary ? <p className="mt-3 text-xs text-fg-3">Resumo: {m.classificationSummary}</p> : null}
      {inbound && m.suggestedReply ? (
        <div className="mt-3 rounded-lg border border-border bg-surface-2/60 p-3 text-13">
          <p className="mb-1 text-xs font-medium text-fg-3">Sugestão de resposta (revise antes de usar)</p>
          <p className="text-fg-2">{m.suggestedReply}</p>
          {onUseSuggestion ? (
            <Button size="xs" variant="soft" className="mt-2" onClick={() => onUseSuggestion(m.suggestedReply!)}>
              Usar como rascunho
            </Button>
          ) : null}
        </div>
      ) : null}

      <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <p className="mr-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
          {src ? (
            <span className="inline-flex items-center gap-1"><src.icon className="size-3" aria-hidden /> {src.label}</span>
          ) : null}
          <span>{inbound ? `De ${m.channel === "WHATSAPP" ? formatPhone(m.fromAddress) : m.fromAddress}` : m.toAddress ? `Para ${m.channel === "WHATSAPP" ? formatPhone(m.toAddress) : m.toAddress}` : null}</span>
          <span>
            {inbound
              ? `Recebida ${formatDateTime(m.receivedAt)}`
              : m.sentAt
                ? `Enviada ${formatDateTime(m.sentAt)} (${m.sendMethod === "MANUAL" ? "manual" : "API"})${m.readAt ? ` · lida ${formatDateTime(m.readAt)}` : m.deliveredAt ? ` · entregue ${formatDateTime(m.deliveredAt)}` : ""}`
                : m.scheduledFor
                  ? `Agendada para ${formatDateTime(m.scheduledFor)}`
                  : `Criada ${formatDateTime(m.createdAt)}`}
          </span>
          {m.approvedByName && !inbound ? <span>Aprovada por {m.approvedByName}</span> : null}
        </p>

        {!inbound && m.status === "PENDING_APPROVAL" && canApprove && !editing ? (
          rejecting ? (
            <span className="flex items-center gap-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)" className="h-8 w-48 text-13" aria-label="Motivo da rejeição" />
              <ActionButton size="sm" variant="danger" action={cmd("reject", reason)} onDone={() => setRejecting(false)}>Rejeitar</ActionButton>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} aria-label="Cancelar rejeição"><X /></Button>
            </span>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil /> Editar</Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}><X /> Rejeitar</Button>
              <ActionButton size="sm" variant={apiReady ? "secondary" : "primary"} action={cmd("approve")}><Check /> Aprovar</ActionButton>
              {apiReady && canSend ? (
                <ActionButton size="sm" variant="primary" action={cmd("approve_send")}><Send /> Aprovar e enviar</ActionButton>
              ) : null}
            </>
          )
        ) : null}

        {!inbound && m.status === "APPROVED" && canSend ? (
          <>
            {manualHref ? (
              <a href={manualHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-13 font-medium text-fg-2 hover:bg-surface-2 hover:text-fg">
                <ExternalLink className="size-4" aria-hidden /> Abrir no {m.channel === "WHATSAPP" ? "WhatsApp" : "e-mail"}
              </a>
            ) : null}
            <ActionButton
              size="sm"
              action={cmd("mark_sent")}
              confirm={{ title: "Confirmar envio manual?", description: "Confirme apenas se você realmente enviou esta mensagem pelo seu WhatsApp ou e-mail. O registro atualiza o funil e as métricas." }}
            >
              <Check /> Marcar como enviada
            </ActionButton>
            {apiReady ? <ActionButton size="sm" variant="primary" action={cmd("send_api")}><Send /> Enviar pela API</ActionButton> : null}
          </>
        ) : null}

        {!inbound && m.status === "FAILED" && canSend ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil /> Editar</Button>
            {apiReady ? <ActionButton size="sm" action={cmd("retry")}><RotateCcw /> Tentar novamente</ActionButton> : null}
          </>
        ) : null}
      </footer>
    </article>
  );
}
