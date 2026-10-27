import { execSync } from "node:child_process";

/** Prepara o banco E2E: migrações, limpeza (somente bancos *_e2e), seed e dados de demonstração. */
export default function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://prospecta:prospecta_dev@localhost:5432/prospecta_e2e?schema=public",
    APP_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
    ADMIN_EMAIL: "admin@e2e.local",
    ADMIN_PASSWORD: "Admin!E2e-2026",
    ADMIN_NAME: "Admin E2E",
  };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx e2e/reset-db.ts", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed-demo.ts", { env, stdio: "pipe" });
}
