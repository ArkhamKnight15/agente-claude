import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("menu mobile abre, navega e fecha com Esc", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await expect(drawer.getByRole("link", { name: "CRM e funil" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await drawer.getByRole("link", { name: "CRM e funil" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "CRM e funil" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
