import type { Permission } from "@/server/security/rbac";

export type NavIcon =
  | "dashboard"
  | "campaigns"
  | "search"
  | "leads"
  | "pipeline"
  | "messages"
  | "proposals"
  | "reports"
  | "tasks"
  | "integrations"
  | "pricing"
  | "agent"
  | "users"
  | "data";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  permission: Permission;
  badgeKey?: "review" | "tasks" | "failedJobs";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Visão geral",
    items: [{ href: "/", label: "Dashboard", icon: "dashboard", permission: "dashboard:read" }],
  },
  {
    label: "Prospecção",
    items: [
      { href: "/campanhas", label: "Campanhas", icon: "campaigns", permission: "campaign:read" },
      { href: "/pesquisa", label: "Pesquisa de empresas", icon: "search", permission: "lead:write" },
      { href: "/leads", label: "Leads", icon: "leads", permission: "lead:read" },
    ],
  },
  {
    label: "Vendas",
    items: [
      { href: "/funil", label: "CRM e funil", icon: "pipeline", permission: "lead:read", badgeKey: "tasks" },
      { href: "/mensagens", label: "Central de mensagens", icon: "messages", permission: "message:read", badgeKey: "review" },
      { href: "/propostas", label: "Propostas", icon: "proposals", permission: "proposal:read" },
    ],
  },
  {
    label: "Análise",
    items: [{ href: "/relatorios", label: "Relatórios", icon: "reports", permission: "report:read" }],
  },
  {
    label: "Sistema",
    items: [
      { href: "/tarefas", label: "Tarefas e erros", icon: "tasks", permission: "campaign:read", badgeKey: "failedJobs" },
      { href: "/integracoes", label: "Integrações", icon: "integrations", permission: "settings:read" },
      { href: "/configuracoes/servicos", label: "Preços e serviços", icon: "pricing", permission: "settings:read" },
      { href: "/configuracoes/agente", label: "Configurações do agente", icon: "agent", permission: "settings:read" },
      { href: "/configuracoes/usuarios", label: "Usuários", icon: "users", permission: "user:manage" },
      { href: "/configuracoes/dados", label: "Dados e LGPD", icon: "data", permission: "settings:read" },
    ],
  },
];
