"use client";

import type { Channel } from "@/generated/prisma/enums";
import { MessageCard, type MessageView } from "@/components/messages/message-card";

export function MessageList({ items, integrations, canApprove, canSend }: { items: MessageView[]; integrations: Record<Channel, boolean>; canApprove: boolean; canSend: boolean }) {
  return (
    <div className="space-y-3">
      {items.map((m) => (
        <MessageCard key={m.id} message={m} integrations={integrations} canApprove={canApprove} canSend={canSend} showLead />
      ))}
    </div>
  );
}
