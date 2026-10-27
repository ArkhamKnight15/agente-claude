import type { CampaignStatus, LeadStage, Priority, WebsiteStatus, VerificationConfidence } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { CAMPAIGN_STATUS_LABELS, CONFIDENCE_LABELS, PRIORITY_LABELS, STAGE_LABELS, WEBSITE_STATUS_LABELS } from "@/data/labels";

export function StageBadge({ stage }: { stage: LeadStage }) {
  const s = STAGE_LABELS[stage];
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function PriorityBadge({ priority, score }: { priority: Priority | null; score?: number | null }) {
  if (!priority) return <Badge>Sem pontuação</Badge>;
  const p = PRIORITY_LABELS[priority];
  return (
    <Badge tone={p.tone}>
      {p.label}
      {score !== undefined && score !== null ? <span className="tabular-nums opacity-80">· {score}</span> : null}
    </Badge>
  );
}

export function WebsiteBadge({ status, confidence }: { status: WebsiteStatus; confidence?: VerificationConfidence }) {
  const w = WEBSITE_STATUS_LABELS[status];
  return (
    <Badge tone={w.tone} title={confidence ? `Verificação: ${CONFIDENCE_LABELS[confidence].label}` : undefined}>
      {w.label}
    </Badge>
  );
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const c = CAMPAIGN_STATUS_LABELS[status];
  return <Badge tone={c.tone} dot>{c.label}</Badge>;
}
