import { expect, test, type Page } from "@playwright/test";

async function entrar(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Senha", { exact: true }).fill("senha-e2e-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Buscar empresas" })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("senha errada é recusada", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha", { exact: true }).fill("errada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Senha incorreta.")).toBeVisible();
});

test("configura a mensagem, busca, envia pelo WhatsApp e acompanha o contato", async ({ page, context }) => {
  await entrar(page);
  await expect(page.getByText("Complete sua mensagem")).toBeVisible();

  // Mensagem
  await page.getByRole("link", { name: "Mensagem", exact: true }).first().click();
  await page.getByLabel("Seu nome").fill("Ana");
  await page.getByLabel("Sua empresa").fill("Ana Sites");
  await expect(page.getByText("Aqui é Ana, da Ana Sites.")).toBeVisible(); // prévia ao vivo
  await page.getByRole("button", { name: "Salvar mensagem" }).click();
  await expect(page.getByText(/Mensagem salva/)).toBeVisible();

  // Busca
  await page.getByRole("link", { name: "Buscar", exact: true }).first().click();
  await expect(page.getByText("Complete sua mensagem")).toHaveCount(0);
  await page.getByLabel("Cidade").fill("campinas");
  await page.getByLabel("Quantidade").selectOption("40");
  await page.getByRole("button", { name: "Buscar empresas" }).click();
  await expect(page.getByRole("heading", { name: "3 oportunidades em Campinas" })).toBeVisible();
  await expect(page.getByText(/1 de outra cidade \(ignorada\) · 1 fechada \(ignorada\)/)).toBeVisible();

  const joao = page.getByRole("article", { name: "Barbearia do João" });
  const whatsapp = joao.getByRole("link", { name: "Enviar no WhatsApp" });
  const href = (await whatsapp.getAttribute("href")) ?? "";
  expect(href.startsWith("https://wa.me/5519980000001?text=")).toBe(true);
  expect(decodeURIComponent(href.split("text=")[1])).toContain("Aqui é Ana, da Ana Sites.\nEncontrei a Barbearia do João");
  await expect(page.getByRole("article", { name: "Navalha de Ouro" }).getByText(/fixo — pode não ter WhatsApp/)).toBeVisible();

  // Quem já tem site fica oculto até pedir.
  await expect(page.getByRole("article", { name: "Studio Barba" })).toHaveCount(0);
  await page.getByLabel(/Mostrar também quem já tem site/).check();
  await expect(page.getByRole("article", { name: "Studio Barba" })).toBeVisible();

  // Abrir o WhatsApp não marca nada sozinho: o sistema pergunta.
  const [aba] = await Promise.all([context.waitForEvent("page"), whatsapp.click()]);
  await aba.close();
  await joao.getByRole("button", { name: "Sim, marcar como enviada" }).click();
  await expect(page.getByText("Marcado como enviado.")).toBeVisible();
  await expect(joao.getByRole("link", { name: "Abrir conversa" })).toBeVisible();

  // Não contatar bloqueia o envio.
  const corte = page.getByRole("article", { name: "Corte Fino" });
  await corte.getByLabel("Andamento do contato").selectOption("nao_contatar");
  await expect(corte.getByText("Pediu para não receber mensagens")).toBeVisible();
  await expect(corte.getByRole("link", { name: /WhatsApp|Abrir conversa/ })).toHaveCount(0);
  await expect(corte.getByRole("button", { name: "Copiar" })).toHaveCount(0);

  // Contatos
  await page.getByRole("link", { name: "Contatos", exact: true }).first().click();
  await expect(page.getByText(/4 empresas salvas/)).toBeVisible();
  await page.getByRole("link", { name: /^Mensagem enviada/ }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Barbearia do João" }).getByText(/Contatado em/)).toBeVisible();

  const obs = page.getByRole("article", { name: "Barbearia do João" }).getByLabel("Observação");
  await obs.fill("Pediu para chamar sexta");
  await obs.blur();
  await expect(page.getByText("Observação salva.")).toBeVisible();

  await page.getByRole("link", { name: /^Todos/ }).click();
  await page.getByLabel("Buscar por nome, cidade ou telefone").fill("3232");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Navalha de Ouro" })).toBeVisible();

  const download = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Exportar planilha" }).click()]).then(([d]) => d);
  expect(download.suggestedFilename()).toMatch(/^contatos-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("rotas protegidas exigem a senha", async ({ request }) => {
  const csv = await request.get("/api/contatos/csv", { maxRedirects: 0 });
  expect(csv.status()).toBe(401);
});
