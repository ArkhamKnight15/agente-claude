import { z } from "zod";

/** Schemas das configurações editáveis pelo painel (persistidas em AppSetting). */

export const variantSchema = z.object({
  key: z.string().trim().min(1).max(4),
  label: z.string().trim().min(1).max(60),
  instructions: z.string().trim().max(500),
});

export const agentSettingsSchema = z.object({
  tone: z.enum(["informal", "formal"]),
  highPriorityMin: z.coerce.number().int().min(1).max(100),
  mediumPriorityMin: z.coerce.number().int().min(0).max(99),
  autoGenerateMessages: z.boolean(),
  useAi: z.boolean(),
  messageMaxChars: z.coerce.number().int().min(200).max(1500),
  includeOptOutHint: z.boolean(),
  extraInstructions: z.string().trim().max(1500),
  abTestEnabled: z.boolean(),
  variants: z.array(variantSchema).min(1).max(4),
});

export type AgentSettings = z.infer<typeof agentSettingsSchema>;

export const contactPolicySchema = z.object({
  approvalMode: z.enum(["MANUAL", "AUTO_EMAIL"]),
  autoApprovalAcknowledged: z.boolean(),
  maxUnansweredMessages: z.coerce.number().int().min(1).max(5),
  minDaysBetweenContacts: z.coerce.number().int().min(1).max(60),
  followUpAfterDays: z.coerce.number().int().min(1).max(60),
  dailyLimitWhatsapp: z.coerce.number().int().min(0).max(1000),
  dailyLimitEmail: z.coerce.number().int().min(0).max(2000),
  sendWindowStartHour: z.coerce.number().int().min(0).max(23),
  sendWindowEndHour: z.coerce.number().int().min(1).max(24),
  sendWeekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1),
  whatsappRequireOptIn: z.boolean(),
  duplicateWindowDays: z.coerce.number().int().min(1).max(365),
  maxLeadsPerCampaign: z.coerce.number().int().min(1).max(1000),
  retentionDaysUncontacted: z.coerce.number().int().min(0).max(3650),
});

export type ContactPolicy = z.infer<typeof contactPolicySchema>;

export const senderProfileSchema = z.object({
  name: z.string().trim().max(80),
  companyName: z.string().trim().max(120),
  email: z.union([z.literal(""), z.string().trim().email()]),
  phone: z.string().trim().max(30),
  portfolioUrl: z.union([z.literal(""), z.string().trim().url()]),
  cnpj: z.string().trim().max(20),
  city: z.string().trim().max(80),
  signature: z.string().trim().max(500),
});

export type SenderProfile = z.infer<typeof senderProfileSchema>;

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  tone: "informal",
  highPriorityMin: 70,
  mediumPriorityMin: 45,
  autoGenerateMessages: true,
  useAi: true,
  messageMaxChars: 600,
  includeOptOutHint: true,
  extraInstructions: "",
  abTestEnabled: false,
  variants: [
    { key: "A", label: "Direta", instructions: "Vá direto ao ponto: oportunidade, preço de entrada e convite." },
    { key: "B", label: "Consultiva", instructions: "Faça uma pergunta sobre como os clientes encontram a empresa hoje antes de oferecer." },
  ],
};

export const DEFAULT_CONTACT_POLICY: ContactPolicy = {
  approvalMode: "MANUAL",
  autoApprovalAcknowledged: false,
  maxUnansweredMessages: 2,
  minDaysBetweenContacts: 3,
  followUpAfterDays: 3,
  dailyLimitWhatsapp: 30,
  dailyLimitEmail: 50,
  sendWindowStartHour: 9,
  sendWindowEndHour: 18,
  sendWeekdays: [1, 2, 3, 4, 5],
  whatsappRequireOptIn: true,
  duplicateWindowDays: 30,
  maxLeadsPerCampaign: 200,
  retentionDaysUncontacted: 180,
};

export const DEFAULT_SENDER_PROFILE: SenderProfile = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  portfolioUrl: "",
  cnpj: "",
  city: "",
  signature: "",
};

export const SETTING_KEYS = {
  agent: "agent",
  contactPolicy: "contactPolicy",
  senderProfile: "senderProfile",
} as const;
