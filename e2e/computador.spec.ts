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
  await expect(page.getByRole("heading", { name: "3 empresas para chamar em Campinas" })).toBeVisible();
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

  // Quem você acabou de marcar continua à vista; numa nova busca, quem já foi chamado some.
  await expect(joao).toBeVisible();
  await page.getByLabel(/Mostrar também quem já tem site/).uncheck();
  await page.getByRole("button", { name: "Buscar empresas" }).click();
  await expect(page.getByRole("heading", { name: "1 empresa para chamar em Campinas" })).toBeVisible();
  await expect(page.getByText(/2 que você já chamou \(ocultas\)/)).toBeVisible();
  await expect(joao).toHaveCount(0);
  await page.getByLabel(/Mostrar quem já chamei \(2\)/).check();
  await expect(joao.getByLabel("Andamento do contato")).toHaveValue("enviado");
  await page.getByLabel(/Mostrar quem já chamei/).uncheck();

  // Chamado em outro aparelho: ao voltar para esta tela, a empresa sai da lista.
  const outroAparelho = await context.newPage();
  await outroAparelho.goto("/contatos");
  await outroAparelho.getByRole("article", { name: "Navalha de Ouro" }).getByLabel("Andamento do contato").selectOption("respondeu");
  await expect(outroAparelho.getByText(/Andamento: Respondeu/)).toBeVisible();
  await outroAparelho.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("article", { name: "Navalha de Ouro" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Você já chamou todas as empresas sem site/ })).toBeVisible();

  // Contatos
  await page.getByRole("link", { name: "Contatos", exact: true }).first().click();
  await expect(page.getByText(/4 empresas salvas/)).toBeVisible();
  await page.getByRole("link", { name: /^Mensagem enviada/ }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Barbearia do João" }).getByText(/Contatado em/)).toBeVisible();
  await page.getByRole("link", { name: /^Todos/ }).click();
  await page.getByRole("article", { name: "Navalha de Ouro" }).getByLabel("Andamento do contato").selectOption("novo");
  await expect(page.getByText(/Andamento: Novo/)).toBeVisible();
  await page.getByRole("link", { name: /^Mensagem enviada/ }).click();
  await expect(page.getByRole("article")).toHaveCount(1);

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

test("importa uma lista colada e já deixa pronta para chamar", async ({ page }) => {
  await entrar(page);
  await page.getByRole("link", { name: "Contatos", exact: true }).first().click();
  await page.getByRole("link", { name: "Importar empresas" }).click();
  await expect(page.getByRole("heading", { name: "Importar empresas", level: 1 })).toBeVisible();

  await page.getByLabel("Cole a lista de empresas").fill(
    [
      "nome;telefone;cidade;uf;site;categoria;endereco;fonte",
      "Barbearia do João;(19) 98000-0001;Campinas;SP;;Barbearia;;",
      "Pet Feliz;(19) 97777-1234;campinas;sp;instagram.com/petfeliz;Pet shop;Rua C, 3;https://exemplo.test/pet",
      "Loja Fantasma;(19) 96666-0000;Cidade Inventada;SP;;;;",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Ver prévia" }).click();
  await expect(page.getByText("1 nova · 1 já chamada · 1 com erro (ignorada)")).toBeVisible();
  await expect(page.getByText(/Cidade “Cidade Inventada” não encontrada em SP/)).toBeVisible();
  await page.getByRole("button", { name: "Importar 2 empresas" }).click();

  await expect(page.getByText(/2 empresas importadas \(1 nova\)/)).toBeVisible();
  const pet = page.getByRole("article", { name: "Pet Feliz" });
  await expect(pet.getByText("Só Instagram")).toBeVisible();
  await expect(pet.getByRole("link", { name: "Enviar no WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/5519977771234\?text=/);
  await expect(pet.getByRole("link", { name: "Fonte" })).toHaveAttribute("href", "https://exemplo.test/pet");
  await expect(page.getByRole("article", { name: "Barbearia do João" })).toHaveCount(0); // já chamada: não aparece para chamar de novo
});

test("rotas protegidas exigem a senha", async ({ request }) => {
  const csv = await request.get("/api/contatos/csv", { maxRedirects: 0 });
  expect(csv.status()).toBe(401);
});
