import { expect, type Page } from "@playwright/test";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("admin@e2e.local");
  await page.getByLabel("Senha", { exact: true }).fill("Admin!E2e-2026");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Olá");
}
