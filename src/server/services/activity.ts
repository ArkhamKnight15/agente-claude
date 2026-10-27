import type { Prisma } from "@/generated/prisma/client";
import type { ActorType } from "@/generated/prisma/enums";
import { db, type Tx } from "@/server/db";

export type ActivityType =
  | "LEAD_CREATED"
  | "LEAD_MERGED"
  | "LEAD_UPDATED"
  | "STAGE_CHANGED"
  | "WEBSITE_CHECKED"
  | "SCORED"
  | "ANALYSIS_GENERATED"
  | "MESSAGE_DRAFTED"
  | "MESSAGE_APPROVED"
  | "MESSAGE_REJECTED"
  | "MESSAGE_SENT"
  | "MESSAGE_FAILED"
  | "MESSAGE_RECEIVED"
  | "OPT_OUT"
  | "OPT_IN"
  | "NOTE_ADDED"
  | "TASK_CREATED"
  | "TASK_COMPLETED"
  | "PROPOSAL_CREATED"
  | "PROPOSAL_APPROVED"
  | "PROPOSAL_SENT"
  | "PROPOSAL_ACCEPTED"
  | "PROPOSAL_REJECTED"
  | "DATA_EXPORTED"
  | "DATA_REFRESHED";

export interface ActivityInput {
  leadId: string;
  type: ActivityType;
  description: string;
  metadata?: Prisma.InputJsonValue;
  actorType?: ActorType;
  actorId?: string | null;
}

/** Linha do tempo da ficha do lead. */
export async function recordActivity(input: ActivityInput, tx?: Tx): Promise<void> {
  await (tx ?? db).activity.create({
    data: {
      leadId: input.leadId,
      type: input.type,
      description: input.description,
      metadata: input.metadata,
      actorType: input.actorType ?? (input.actorId ? "USER" : "SYSTEM"),
      actorId: input.actorId ?? null,
    },
  });
}
