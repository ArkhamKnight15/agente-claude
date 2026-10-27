import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { db } from "@/server/db";
import { createUser } from "@/server/services/users";

/** Cria um usuário pela linha de comando: npm run user:create -- email@x.com "Nome" ADMIN */
async function main() {
  const [email, name, roleArg] = process.argv.slice(2);
  if (!email || !name) {
    console.log('Uso: npm run user:create -- email@empresa.com "Nome Completo" [ADMIN|OPERATOR|VIEWER]');
    process.exitCode = 1;
    return;
  }
  const role = (roleArg ?? "OPERATOR").toUpperCase();
  if (!["ADMIN", "OPERATOR", "VIEWER"].includes(role)) throw new Error("Papel inválido.");
  const rl = createInterface({ input: stdin, output: stdout });
  const password = await rl.question("Senha (mín. 10 caracteres): ");
  rl.close();
  await createUser({ email, name, role: role as "ADMIN" | "OPERATOR" | "VIEWER", password }, null);
  console.log(`✔ Usuário ${email} criado como ${role}.`);
}

main()
  .catch((error) => {
    console.error(`✖ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
