import { expect, test } from "@playwright/test";

/** Roda depois do computador: o andamento feito lá precisa aparecer aqui (mesmo banco). */
test("no celular, o andamento é o mesmo e as telas cabem na largura", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Senha", { exact: true }).fill("senha-e2e-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Buscar empresas" })).toBeVisible();

  const barraInferior = page.getByRole("navigation", { name: "Principal" }).last();
  await expect(barraInferior).toBeVisible();

  for (const [aba, titulo] of [
    ["Contatos", "Contatos"],
    ["Mensagem", "Mensagem"],
    ["Buscar", "Buscar empresas"],
  ] as const) {
    await barraInferior.getByRole("link", { name: aba, exact: true }).click();
    await expect(page.getByRole("heading", { name: titulo, level: 1 })).toBeVisible();
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sobra, `rolagem horizontal em ${aba}`).toBeLessThanOrEqual(0);
  }

  await page.goto("/contatos/importar");
  await expect(page.getByRole("heading", { name: "Importar empresas", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await barraInferior.getByRole("link", { name: "Contatos", exact: true }).click();
  const joao = page.getByRole("article", { name: "Barbearia do João" });
  await expect(joao.getByLabel("Andamento do contato")).toHaveValue("enviado");
  await expect(joao.getByLabel("Observação")).toHaveValue("Pediu para chamar sexta");
});
