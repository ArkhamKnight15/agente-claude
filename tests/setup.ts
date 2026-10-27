// Ambiente dos testes: banco dedicado e segredos fictícios (nenhuma integração externa ativa).
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://prospecta:prospecta_dev@localhost:5432/prospecta_test?schema=public";
process.env.APP_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
process.env.APP_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "error";
for (const key of [
  "ANTHROPIC_API_KEY", "GOOGLE_PLACES_API_KEY", "BRAVE_SEARCH_API_KEY", "SERPER_API_KEY", "GOOGLE_CSE_API_KEY", "SEARCH_PROVIDER",
  "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE_NAME", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM",
  "IMAP_HOST", "IMAP_USER", "IMAP_PASSWORD",
]) delete process.env[key];
process.env.OSM_ENABLED = "false";
process.env.WHATSAPP_APP_SECRET = "whatsapp-app-secret-for-tests";
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-token-for-tests";
