import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("protege as páginas e rejeita senha errada", async ({ page }) => {
  await page.goto("/leads");
  await expect(page).toHaveURL(/\/login\?next=%2Fleads/);
  await page.getByLabel("E-mail").fill("admin@e2e.local");
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});

test("dashboard mostra indicadores e o aviso de dados de demonstração", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Modo demonstração")).toBeVisible();
  await expect(page.getByText("Empresas pesquisadas")).toBeVisible();
  await expect(page.getByText("Receita realizada")).toBeVisible();
});

test("lista de leads filtra por nome e abre a ficha", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Leads" }).first().click();
  await page.getByPlaceholder("Nome, telefone ou e-mail").fill("Barbearia Modelo");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByRole("link", { name: /Barbearia Modelo Vintage/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Oficina Mecânica/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Barbearia Modelo Vintage/ }).click();
  await expect(page.getByRole("heading", { name: "Análise do agente" })).toBeVisible();
  await expect(page.getByText("Venda fechada").first()).toBeVisible();
});

test("aprovar mensagem na central exige ação explícita e registra envio manual", async ({ page }) => {
  await login(page);
  await page.goto("/mensagens");
  const card = page.locator("article").first();
  await card.getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByText("Mensagem aprovada.")).toBeVisible();
  await page.getByRole("link", { name: /Aprovadas/ }).click();
  const approved = page.locator("article").first();
  await expect(approved.getByText("Aprovada", { exact: true })).toBeVisible();
  // Lead de demonstração: o envio é bloqueado pela política de contato.
  await approved.getByRole("button", { name: "Marcar como enviada" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText(/demonstração: envios reais são bloqueados/)).toBeVisible();
});

test("nova campanha sem fonte configurada orienta a configurar integrações", async ({ page }) => {
  await login(page);
  await page.goto("/campanhas/nova");
  await expect(page.getByText("Nenhuma fonte de empresas configurada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar campanha" })).toBeDisabled();
});

test("exporta leads em CSV", async ({ page }) => {
  await login(page);
  const response = await page.request.get("/api/leads/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(await response.text()).toContain("Nome;Nicho;Cidade");
});

test("integrações mostram status pendente sem expor segredos", async ({ page }) => {
  await login(page);
  await page.goto("/integracoes");
  await expect(page.getByRole("heading", { name: "WhatsApp Business Platform (Cloud API)" })).toBeVisible();
  await expect(page.getByText("WHATSAPP_ACCESS_TOKEN").first()).toBeVisible();
  await expect(page.getByText("Pendente").first()).toBeVisible();
});
