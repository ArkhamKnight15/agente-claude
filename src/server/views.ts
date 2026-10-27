import type { Message } from "@/generated/prisma/client";
import type { MessageView } from "@/components/messages/message-card";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Converte uma mensagem do banco no formato serializável usado pela interface. */
export function toMessageView(
  m: Message & { approvedBy?: { name: string } | null; lead?: { id: string; name: string; city: string; state: string; isDemo: boolean } },
): MessageView {
  return {
    id: m.id,
    channel: m.channel,
    direction: m.direction,
    status: m.status,
    purpose: m.purpose,
    subject: m.subject,
    body: m.body,
    toAddress: m.toAddress,
    fromAddress: m.fromAddress,
    variant: m.variant,
    generatedBy: m.generatedBy,
    warnings: (m.warnings as string[] | null) ?? [],
    error: m.error,
    sendMethod: m.sendMethod,
    templateName: m.templateName,
    scheduledFor: iso(m.scheduledFor),
    sentAt: iso(m.sentAt),
    deliveredAt: iso(m.deliveredAt),
    readAt: iso(m.readAt),
    receivedAt: iso(m.receivedAt),
    createdAt: m.createdAt.toISOString(),
    approvedByName: m.approvedBy?.name ?? null,
    classification: m.classification,
    classificationSummary: m.classificationSummary,
    suggestedReply: m.suggestedReply,
    lead: m.lead ? { id: m.lead.id, name: m.lead.name, city: m.lead.city, state: m.lead.state, isDemo: m.lead.isDemo } : undefined,
  };
}
