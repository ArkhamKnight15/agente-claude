import type {
  CampaignStatus,
  Channel,
  CostCategory,
  JobStatus,
  LeadStage,
  LossReason,
  MessagePurpose,
  MessageStatus,
  Priority,
  ProposalStatus,
  ReplyClassification,
  Role,
  TaskType,
  VerificationConfidence,
  WebsiteStatus,
  DataProvider,
} from "@/generated/prisma/enums";

/** Rótulos em português e tons visuais para os enums do domínio. */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

interface LabelInfo {
  label: string;
  tone: Tone;
  description?: string;
}

export const ROLE_LABELS: Record<Role, LabelInfo> = {
  ADMIN: { label: "Administrador", tone: "accent", description: "Acesso total, incluindo configurações e usuários." },
  OPERATOR: { label: "Operador comercial", tone: "info", description: "Campanhas, leads, mensagens e propostas (sem aprovar propostas)." },
  VIEWER: { label: "Leitura", tone: "neutral", description: "Apenas visualiza dados e relatórios." },
};

export const STAGE_ORDER: LeadStage[] = [
  "FOUND",
  "VERIFYING",
  "QUALIFIED",
  "MESSAGE_READY",
  "CONTACTED",
  "AWAITING_REPLY",
  "INTERESTED",
  "NEGOTIATION",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
  "DO_NOT_CONTACT",
];

export const STAGE_LABELS: Record<LeadStage, LabelInfo> = {
  FOUND: { label: "Empresa encontrada", tone: "neutral" },
  VERIFYING: { label: "Dados em verificação", tone: "neutral" },
  QUALIFIED: { label: "Lead qualificado", tone: "info" },
  MESSAGE_READY: { label: "Mensagem preparada", tone: "info" },
  CONTACTED: { label: "Contato realizado", tone: "accent" },
  AWAITING_REPLY: { label: "Aguardando resposta", tone: "accent" },
  INTERESTED: { label: "Interessado", tone: "success" },
  NEGOTIATION: { label: "Negociação", tone: "success" },
  PROPOSAL_SENT: { label: "Proposta enviada", tone: "warning" },
  WON: { label: "Venda fechada", tone: "success" },
  LOST: { label: "Sem interesse", tone: "danger" },
  DO_NOT_CONTACT: { label: "Não contatar novamente", tone: "danger" },
};

export const OPEN_STAGES: LeadStage[] = STAGE_ORDER.filter(
  (s) => s !== "WON" && s !== "LOST" && s !== "DO_NOT_CONTACT",
);

export const WEBSITE_STATUS_LABELS: Record<WebsiteStatus, LabelInfo> = {
  NOT_CHECKED: { label: "Não verificado", tone: "neutral" },
  NO_WEBSITE_CONFIRMED: { label: "Sem site próprio confirmado", tone: "success" },
  NO_WEBSITE_LIKELY: { label: "Provavelmente sem site", tone: "info" },
  WEBSITE_WITH_ISSUES: { label: "Site com problemas aparentes", tone: "warning" },
  PROFESSIONAL_WEBSITE: { label: "Possui site profissional", tone: "danger" },
  INCONCLUSIVE: { label: "Inconclusivo", tone: "neutral" },
};

export const CONFIDENCE_LABELS: Record<VerificationConfidence, LabelInfo> = {
  CONFIRMED: { label: "Confirmado", tone: "success" },
  PROBABLE: { label: "Provável", tone: "info" },
  UNVERIFIED: { label: "Não verificado", tone: "neutral" },
};

export const PRIORITY_LABELS: Record<Priority, LabelInfo> = {
  HIGH: { label: "Alta", tone: "success" },
  MEDIUM: { label: "Média", tone: "warning" },
  LOW: { label: "Baixa", tone: "neutral" },
};

export const PRIORITY_RANK: Record<Priority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export const LOSS_REASON_LABELS: Record<LossReason, string> = {
  PRICE: "Preço",
  ALREADY_HAS_WEBSITE: "Já possui site",
  NO_NEED: "Não vê necessidade",
  NO_RESPONSE: "Sem resposta",
  CHOSE_COMPETITOR: "Escolheu concorrente",
  BAD_TIMING: "Momento inadequado",
  INVALID_CONTACT: "Contato inválido",
  BUSINESS_CLOSED: "Empresa fechada",
  OTHER: "Outro motivo",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, LabelInfo> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  RUNNING: { label: "Em execução", tone: "accent" },
  PAUSED: { label: "Pausada", tone: "warning" },
  CANCELLED: { label: "Cancelada", tone: "danger" },
  COMPLETED: { label: "Concluída", tone: "success" },
  FAILED: { label: "Falhou", tone: "danger" },
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
};

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, LabelInfo> = {
  PENDING_APPROVAL: { label: "Aguardando aprovação", tone: "warning" },
  APPROVED: { label: "Aprovada", tone: "info" },
  QUEUED: { label: "Na fila de envio", tone: "info" },
  SENT: { label: "Enviada", tone: "accent" },
  DELIVERED: { label: "Entregue", tone: "success" },
  READ: { label: "Lida", tone: "success" },
  FAILED: { label: "Falhou", tone: "danger" },
  REJECTED: { label: "Rejeitada", tone: "neutral" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
  RECEIVED: { label: "Recebida", tone: "success" },
};

export const MESSAGE_PURPOSE_LABELS: Record<MessagePurpose, string> = {
  INITIAL: "Primeiro contato",
  FOLLOW_UP: "Acompanhamento",
  PROPOSAL: "Envio de proposta",
  REPLY: "Resposta",
};

export const REPLY_CLASSIFICATION_LABELS: Record<ReplyClassification, LabelInfo> = {
  INTERESTED: { label: "Interessado", tone: "success" },
  QUESTION: { label: "Dúvida", tone: "info" },
  NOT_INTERESTED: { label: "Sem interesse", tone: "danger" },
  OPT_OUT: { label: "Pediu para não receber", tone: "danger" },
  NEUTRAL: { label: "Neutra", tone: "neutral" },
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, LabelInfo> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  APPROVED: { label: "Aprovada para envio", tone: "info" },
  SENT: { label: "Enviada", tone: "accent" },
  ACCEPTED: { label: "Aceita", tone: "success" },
  REJECTED: { label: "Recusada", tone: "danger" },
  EXPIRED: { label: "Expirada", tone: "neutral" },
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  FOLLOW_UP: "Acompanhamento",
  CALL: "Ligação",
  SEND_PROPOSAL: "Enviar proposta",
  REPLY: "Responder cliente",
  MEETING: "Reunião",
  OTHER: "Outro",
};

export const JOB_STATUS_LABELS: Record<JobStatus, LabelInfo> = {
  QUEUED: { label: "Na fila", tone: "neutral" },
  RUNNING: { label: "Executando", tone: "accent" },
  SUCCEEDED: { label: "Concluída", tone: "success" },
  FAILED: { label: "Falhou", tone: "danger" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
};

export const JOB_TYPE_LABELS: Record<string, string> = {
  "campaign.search": "Pesquisa de empresas",
  "lead.process": "Verificação e qualificação de lead",
  "campaign.finalize": "Relatório da campanha",
  "message.send": "Envio de mensagem",
  "inbound.process": "Processamento de resposta",
  "email.syncInbox": "Sincronização da caixa de e-mail",
  "followups.scan": "Verificação de acompanhamentos",
  "maintenance.cleanup": "Limpeza de dados expirados",
};

export const PROVIDER_LABELS: Record<DataProvider, string> = {
  GOOGLE_PLACES: "Google Places",
  OSM: "OpenStreetMap",
  WEB_SEARCH: "Busca web",
  WEBSITE: "Site da empresa",
  MANUAL: "Cadastro manual",
};

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  API: "APIs e integrações",
  TOOLS: "Ferramentas",
  ADS: "Anúncios",
  OTHER: "Outros",
};
