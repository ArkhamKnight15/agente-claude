import type { Job, Prisma } from "@/generated/prisma/client";
import type { JobType } from "@/server/jobs/queue";
import { handleCampaignFinalize } from "./handlers/campaign-finalize";
import { handleCampaignSearch } from "./handlers/campaign-search";
import { handleLeadProcess } from "./handlers/lead-process";
import { handleFollowupsScan, handleMaintenanceCleanup } from "./handlers/maintenance";
import { handleEmailSync, handleInboundProcess, handleMessageSend } from "./handlers/messaging";

/** "rescheduled" indica que o handler já devolveu o job à fila. */
export type JobHandler = (job: Job) => Promise<Prisma.InputJsonValue | "rescheduled">;

export const JOB_HANDLERS: Record<JobType, JobHandler> = {
  "campaign.search": handleCampaignSearch,
  "lead.process": handleLeadProcess,
  "campaign.finalize": handleCampaignFinalize,
  "message.send": handleMessageSend,
  "inbound.process": handleInboundProcess,
  "email.syncInbox": () => handleEmailSync(),
  "followups.scan": () => handleFollowupsScan(),
  "maintenance.cleanup": () => handleMaintenanceCleanup(),
};
