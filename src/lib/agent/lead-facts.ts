import type {
  DataProvider,
  Priority,
  VerificationConfidence,
  WebsiteStatus,
} from "@/generated/prisma/enums";

/** Fatos verificados sobre o lead — única base permitida para a IA e os templates. */
export interface LeadFacts {
  name: string;
  category: string | null;
  nicheLabel: string;
  nichePlural: string;
  nicheNeed: string;
  nicheBenefits: string[];
  suggestedSections: string[];
  city: string;
  state: string;
  source: DataProvider;
  websiteStatus: WebsiteStatus;
  websiteConfidence: VerificationConfidence;
  websiteIssues: string[];
  websiteSummary: string | null;
  hasInstagram: boolean;
  hasFacebook: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  rating: number | null;
  reviewCount: number | null;
  score: number | null;
  priority: Priority | null;
  scoreSummary: string | null;
}

export interface CommercialContext {
  price: number;
  packageName: string;
  deliveryDays: number;
  features: string[];
  notIncluded: string[];
  senderName: string;
  senderCompany: string;
  portfolioUrl: string;
  signature: string;
  tone: "informal" | "formal";
  maxChars: number;
  includeOptOutHint: boolean;
  extraInstructions: string;
  variant: { key: string; label: string; instructions: string } | null;
}

export interface LeadAnalysis {
  classificationReason: string;
  identifiedNeed: string;
  benefits: string[];
  salesArgument: string;
  whatsappMessage: string;
  emailSubject: string;
  emailBody: string;
  nextAction: string;
}

export interface StoredAnalysis extends LeadAnalysis {
  generatedBy: string;
  generatedAt: string;
  variant: string | null;
  warnings: string[];
  aiError?: string;
}
