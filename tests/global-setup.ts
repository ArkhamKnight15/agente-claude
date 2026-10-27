import { execSync } from "node:child_process";

/** Aplica as migrações no banco de teste antes da suíte. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://prospecta:prospecta_dev@localhost:5432/prospecta_test?schema=public";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
