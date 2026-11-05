import { defineConfig, devices } from "@playwright/test";

/**
 * Testes ponta a ponta contra o build de produção (rode `npm run build` antes).
 * A API do Google é simulada; o banco precisa terminar em "_e2e" (E2E_DATABASE_URL).
 */
const PORTA = 3300;
const banco = process.env.E2E_DATABASE_URL ?? "";
if (!/_e2e(\?|$)/.test(banco)) throw new Error("Defina E2E_DATABASE_URL com um banco cujo nome termina em _e2e.");

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  globalSetup: "./e2e/preparar.ts",
  use: { baseURL: `http://127.0.0.1:${PORTA}`, locale: "pt-BR", trace: "retain-on-failure" },
  projects: [
    { name: "computador", use: { viewport: { width: 1360, height: 900 } }, testMatch: /computador\.spec\.ts/ },
    { name: "celular", use: { ...devices["Pixel 7"] }, testMatch: /celular\.spec\.ts/, dependencies: ["computador"] },
  ],
  webServer: [
    { command: "node e2e/google-simulado.mjs --servir 4466", port: 4466, reuseExistingServer: false },
    {
      command: `npx next start -p ${PORTA}`,
      port: PORTA,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: banco,
        APP_PASSWORD: "senha-e2e-123",
        GOOGLE_PLACES_API_KEY: "chave-de-teste",
        GOOGLE_PLACES_URL: "http://127.0.0.1:4466/v1/places:searchText",
        PLACES_DAILY_LIMIT: "30",
      },
    },
  ],
});
