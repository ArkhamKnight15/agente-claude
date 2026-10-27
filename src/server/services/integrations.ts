import { getEnv } from "@/server/env";
import { errorMessage } from "@/server/errors";
import { isImapConfigured, isSmtpConfigured, verifyImap, verifySmtp } from "@/server/integrations/email";
import { isLlmConfigured, llmModel, pingLlm } from "@/server/integrations/llm";
import { googlePlacesSource } from "@/server/integrations/sources/google-places";
import { getWebSearchProvider, webSearch } from "@/server/integrations/web-search";
import { getWhatsappPhoneInfo, isWhatsappConfigured, isWhatsappWebhookConfigured, whatsappTemplateConfigured } from "@/server/integrations/whatsapp";
import { audit } from "@/server/security/audit";
import { logEvent } from "@/server/services/events";
import { usageToday } from "@/server/services/usage";

export type IntegrationKey = "google_places" | "osm" | "web_search" | "llm" | "whatsapp" | "smtp" | "imap";

export interface IntegrationStatus {
  key: IntegrationKey;
  name: string;
  purpose: string;
  status: "active" | "pending" | "partial" | "disabled";
  details: string[];
  envVars: Array<{ name: string; set: boolean; required: boolean }>;
  docsUrl: string;
  usageToday?: number;
  dailyLimit?: number;
  testable: boolean;
  testCost?: string;
}

function v(name: keyof ReturnType<typeof getEnv>, required = true) {
  const value = getEnv()[name];
  return { name, set: value !== undefined && value !== "" && value !== false, required };
}

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const env = getEnv();
  const usage = await usageToday();
  const search = getWebSearchProvider();
  const whatsappReady = isWhatsappConfigured();
  const webhookReady = isWhatsappWebhookConfigured();

  return [
    {
      key: "google_places",
      name: "Google Places API (New)",
      purpose: "Pesquisa de empresas por nicho e cidade, com telefone, site e perfil no Maps.",
      status: googlePlacesSource.isConfigured() ? "active" : "pending",
      details: ["Requer projeto no Google Cloud com a Places API (New) ativada e faturamento habilitado."],
      envVars: [v("GOOGLE_PLACES_API_KEY"), { name: "PLACES_DAILY_LIMIT", set: true, required: false }],
      docsUrl: "https://developers.google.com/maps/documentation/places/web-service/text-search",
      usageToday: usage.google_places ?? 0,
      dailyLimit: env.PLACES_DAILY_LIMIT,
      testable: googlePlacesSource.isConfigured(),
      testCost: "1 chamada de Text Search",
    },
    {
      key: "osm",
      name: "OpenStreetMap (Overpass API)",
      purpose: "Fonte aberta e gratuita de estabelecimentos. Cobertura varia por cidade.",
      status: env.OSM_ENABLED ? "active" : "disabled",
      details: [`Servidor: ${env.OVERPASS_URL}`, "Dados © colaboradores do OpenStreetMap (licença ODbL)."],
      envVars: [v("OSM_ENABLED", false), { name: "OVERPASS_URL", set: true, required: false }, v("OSM_CONTACT_EMAIL", false)],
      docsUrl: "https://wiki.openstreetmap.org/wiki/Overpass_API",
      usageToday: usage.overpass ?? 0,
      testable: env.OSM_ENABLED,
      testCost: "1 consulta leve à Overpass",
    },
    {
      key: "web_search",
      name: "Busca web (verificação de sites)",
      purpose: "Confirma se a empresa tem site próprio com pelo menos duas consultas independentes.",
      status: search ? "active" : "pending",
      details: [
        search ? `Provedor ativo: ${search.label}` : "Sem busca web, a ausência de site fica como “provável”, nunca “confirmada”.",
        "Opções: Brave Search API, Serper.dev ou Google Programmable Search (legado).",
      ],
      envVars: [v("SEARCH_PROVIDER", false), v("BRAVE_SEARCH_API_KEY", false), v("SERPER_API_KEY", false), v("GOOGLE_CSE_API_KEY", false), v("GOOGLE_CSE_CX", false)],
      docsUrl: "https://api-dashboard.search.brave.com/app/documentation/web-search/get-started",
      usageToday: search ? (usage[`search_${search.id}`] ?? 0) : 0,
      dailyLimit: env.SEARCH_DAILY_LIMIT,
      testable: Boolean(search),
      testCost: "1 consulta de busca",
    },
    {
      key: "llm",
      name: "IA — Claude API",
      purpose: "Análise dos leads, mensagens personalizadas e classificação de respostas.",
      status: isLlmConfigured() ? "active" : "pending",
      details: [
        `Modelo: ${llmModel()} · esforço: ${env.LLM_EFFORT}`,
        isLlmConfigured() ? "Sem a chave, o agente usa modelos de mensagem determinísticos." : "Enquanto não configurada, o agente usa modelos de mensagem determinísticos (sem IA).",
      ],
      envVars: [v("ANTHROPIC_API_KEY"), { name: "LLM_MODEL", set: true, required: false }, { name: "LLM_EFFORT", set: true, required: false }],
      docsUrl: "https://docs.claude.com/en/api/overview",
      testable: isLlmConfigured(),
      testCost: "1 requisição mínima",
    },
    {
      key: "whatsapp",
      name: "WhatsApp Business Platform (Cloud API)",
      purpose: "Envio oficial de mensagens aprovadas, status de entrega e recebimento de respostas por webhook.",
      status: whatsappReady && webhookReady && whatsappTemplateConfigured() ? "active" : whatsappReady ? "partial" : "pending",
      details: [
        `Webhook: ${env.APP_URL}/api/webhooks/whatsapp ${webhookReady ? "(configurado)" : "(defina WHATSAPP_APP_SECRET e WHATSAPP_WEBHOOK_VERIFY_TOKEN)"}`,
        whatsappTemplateConfigured()
          ? `Modelo para iniciar conversas: ${env.WHATSAPP_TEMPLATE_NAME} (${env.WHATSAPP_TEMPLATE_LANGUAGE})`
          : "Sem modelo aprovado: só é possível responder dentro da janela de 24h.",
        "Sem a API, use o envio manual assistido (link wa.me) — você envia do seu WhatsApp.",
      ],
      envVars: [
        v("WHATSAPP_ACCESS_TOKEN"),
        v("WHATSAPP_PHONE_NUMBER_ID"),
        v("WHATSAPP_BUSINESS_ACCOUNT_ID", false),
        v("WHATSAPP_APP_SECRET"),
        v("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
        v("WHATSAPP_TEMPLATE_NAME"),
        { name: "WHATSAPP_API_VERSION", set: true, required: false },
      ],
      docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
      testable: whatsappReady,
      testCost: "Consulta ao número cadastrado (sem envio)",
    },
    {
      key: "smtp",
      name: "E-mail — envio (SMTP)",
      purpose: "Envio de e-mails aprovados com link de descadastro e propostas em PDF.",
      status: isSmtpConfigured() ? "active" : "pending",
      details: ["Use o SMTP do seu provedor (Google Workspace, Zoho, Amazon SES, Brevo etc.). Configure SPF, DKIM e DMARC no domínio."],
      envVars: [v("SMTP_HOST"), { name: "SMTP_PORT", set: true, required: false }, v("SMTP_USER"), v("SMTP_PASSWORD"), v("EMAIL_FROM"), v("EMAIL_REPLY_TO", false)],
      docsUrl: "https://nodemailer.com/smtp/",
      testable: isSmtpConfigured(),
      testCost: "Conexão e autenticação (sem envio)",
    },
    {
      key: "imap",
      name: "E-mail — respostas (IMAP)",
      purpose: "Leitura das respostas a cada 5 minutos para atualizar o CRM.",
      status: isImapConfigured() ? "active" : "pending",
      details: [`Pasta monitorada: ${env.IMAP_MAILBOX}`],
      envVars: [v("IMAP_HOST"), { name: "IMAP_PORT", set: true, required: false }, v("IMAP_USER"), v("IMAP_PASSWORD")],
      docsUrl: "https://imapflow.com/",
      testable: isImapConfigured(),
      testCost: "Conexão e autenticação",
    },
  ];
}

/** Executa um teste real de conexão. Nunca simula sucesso. */
export async function testIntegration(key: IntegrationKey, userId: string): Promise<{ ok: boolean; message: string }> {
  let result: { ok: boolean; message: string };
  try {
    switch (key) {
      case "google_places": {
        const page = await googlePlacesSource.search({ term: "padaria", city: "São Paulo", state: "SP", limit: 1 });
        result = { ok: true, message: `Conexão OK — ${page.items.length} resultado(s) retornado(s).` };
        break;
      }
      case "osm": {
        const url = getEnv().OVERPASS_URL.replace(/interpreter\/?$/, "status");
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        result = response.ok ? { ok: true, message: `Overpass respondeu: ${(await response.text()).split("\n")[0]?.slice(0, 120)}` } : { ok: false, message: `Overpass respondeu HTTP ${response.status}.` };
        break;
      }
      case "web_search": {
        const { provider, results } = await webSearch("criação de sites pequenas empresas");
        result = { ok: true, message: `${provider.label} OK — ${results.length} resultado(s).` };
        break;
      }
      case "llm": {
        const model = await pingLlm();
        result = { ok: true, message: `Claude API OK — modelo ${model}.` };
        break;
      }
      case "whatsapp": {
        const info = await getWhatsappPhoneInfo();
        result = { ok: true, message: `Número ${info.displayPhone} (${info.verifiedName || "sem nome verificado"}), qualidade ${info.quality ?? "—"}.` };
        break;
      }
      case "smtp":
        await verifySmtp();
        result = { ok: true, message: "Servidor SMTP aceitou a conexão e a autenticação." };
        break;
      case "imap":
        await verifyImap();
        result = { ok: true, message: "Servidor IMAP aceitou a conexão e a autenticação." };
        break;
    }
  } catch (error) {
    result = { ok: false, message: errorMessage(error) };
  }
  await logEvent({ level: result.ok ? "INFO" : "ERROR", source: `integration.${key}`, message: `Teste de integração: ${result.message}` });
  await audit({ userId, action: "integration.test", entityType: "Integration", entityId: key, metadata: { ok: result.ok } });
  return result;
}
