import { z } from "zod";
import { LeadStage, Priority, WebsiteStatus } from "@/generated/prisma/enums";
import type { LeadFilters } from "@/server/services/leads";

const filterSchema = z.object({
  q: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
  city: z.string().max(80).optional(),
  niche: z.string().max(60).optional(),
  priority: z.enum(Priority).optional(),
  stage: z.enum(LeadStage).optional(),
  websiteStatus: z.enum(WebsiteStatus).optional(),
  campaignId: z.string().max(40).optional(),
  sort: z.enum(["score", "recent", "name", "lastContact"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

/** Converte parâmetros de URL em filtros validados (ignora valores inválidos). */
export function parseLeadFilters(raw: Record<string, string | string[] | undefined>): LeadFilters {
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v));
  const parsed = filterSchema.safeParse(flat);
  return parsed.success ? parsed.data : {};
}

