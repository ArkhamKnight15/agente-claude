import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  agentSettingsSchema,
  contactPolicySchema,
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_CONTACT_POLICY,
  DEFAULT_SENDER_PROFILE,
  senderProfileSchema,
  SETTING_KEYS,
  type AgentSettings,
  type ContactPolicy,
  type SenderProfile,
} from "@/lib/settings-schema";
import { toNumber } from "@/lib/format";

async function readSetting<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const row = await db.appSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  // Mescla com o padrão para tolerar campos novos adicionados em versões futuras.
  const merged = { ...(fallback as object), ...(row.value as object) };
  const parsed = schema.safeParse(merged);
  return parsed.success ? parsed.data : fallback;
}

async function writeSetting(key: string, value: unknown, userId?: string) {
  await db.appSetting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedById: userId },
    update: { value: value as Prisma.InputJsonValue, updatedById: userId },
  });
}

export const getAgentSettings = () =>
  readSetting<AgentSettings>(SETTING_KEYS.agent, agentSettingsSchema, DEFAULT_AGENT_SETTINGS);
export const getContactPolicy = () =>
  readSetting<ContactPolicy>(SETTING_KEYS.contactPolicy, contactPolicySchema, DEFAULT_CONTACT_POLICY);
export const getSenderProfile = () =>
  readSetting<SenderProfile>(SETTING_KEYS.senderProfile, senderProfileSchema, DEFAULT_SENDER_PROFILE);

export const saveAgentSettings = (value: AgentSettings, userId?: string) =>
  writeSetting(SETTING_KEYS.agent, agentSettingsSchema.parse(value), userId);
export const saveContactPolicy = (value: ContactPolicy, userId?: string) =>
  writeSetting(SETTING_KEYS.contactPolicy, contactPolicySchema.parse(value), userId);
export const saveSenderProfile = (value: SenderProfile, userId?: string) =>
  writeSetting(SETTING_KEYS.senderProfile, senderProfileSchema.parse(value), userId);

export interface PackageSummary {
  id: string;
  name: string;
  description: string;
  price: number;
  deliveryDays: number;
  revisions: number;
  features: string[];
  notIncluded: string[];
  clientResponsibilities: string[];
  paymentTerms: string;
  supportTerms: string;
}

function toPackageSummary(pkg: Prisma.ServicePackageGetPayload<object>): PackageSummary {
  return {
    id: pkg.id,
    name: pkg.name,
    description: pkg.description,
    price: toNumber(pkg.price),
    deliveryDays: pkg.deliveryDays,
    revisions: pkg.revisions,
    features: (pkg.features as string[]) ?? [],
    notIncluded: (pkg.notIncluded as string[]) ?? [],
    clientResponsibilities: (pkg.clientResponsibilities as string[]) ?? [],
    paymentTerms: pkg.paymentTerms,
    supportTerms: pkg.supportTerms,
  };
}

/** Pacote padrão usado nas mensagens e propostas (o primeiro ativo, se nenhum for padrão). */
export async function getDefaultPackage(): Promise<PackageSummary | null> {
  const pkg =
    (await db.servicePackage.findFirst({ where: { active: true, isDefault: true } })) ??
    (await db.servicePackage.findFirst({ where: { active: true }, orderBy: { price: "asc" } }));
  return pkg ? toPackageSummary(pkg) : null;
}

export async function listPackages(): Promise<Array<PackageSummary & { isDefault: boolean; active: boolean }>> {
  const rows = await db.servicePackage.findMany({ orderBy: [{ active: "desc" }, { price: "asc" }] });
  return rows.map((row) => ({ ...toPackageSummary(row), isDefault: row.isDefault, active: row.active }));
}

export async function getPackage(id: string): Promise<PackageSummary | null> {
  const pkg = await db.servicePackage.findUnique({ where: { id } });
  return pkg ? toPackageSummary(pkg) : null;
}
