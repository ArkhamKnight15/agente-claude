import { db } from "@/server/db";
import { hashPassword } from "@/server/security/crypto";
import { DEFAULT_AGENT_SETTINGS, DEFAULT_CONTACT_POLICY, DEFAULT_SENDER_PROFILE } from "@/lib/settings-schema";

/** Limpa todas as tabelas — só executa em bancos de teste. */
export async function resetDatabase() {
  const [{ current_database: name }] = await db.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  if (!/_(test|e2e)$/.test(name)) throw new Error(`Recusado: ${name} não é um banco de teste.`);
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

export async function seedBasics() {
  const admin = await db.user.create({ data: { email: "admin@test.local", name: "Admin Teste", role: "ADMIN", passwordHash: await hashPassword("Senha!Forte123") } });
  await db.servicePackage.create({
    data: {
      name: "Essencial", description: "Site de uma página", price: 500, deliveryDays: 10, isDefault: true,
      features: ["Site responsivo", "Botão de WhatsApp"], notIncluded: ["Hospedagem", "Domínio"], clientResponsibilities: ["Enviar fotos"],
      paymentTerms: "50% + 50%", supportTerms: "30 dias de correções",
    },
  });
  await db.appSetting.createMany({
    data: [
      { key: "agent", value: DEFAULT_AGENT_SETTINGS },
      // Janela de envio 24h/7 dias para os testes não dependerem do horário.
      { key: "contactPolicy", value: { ...DEFAULT_CONTACT_POLICY, sendWindowStartHour: 0, sendWindowEndHour: 24, sendWeekdays: [0, 1, 2, 3, 4, 5, 6] } },
      { key: "senderProfile", value: { ...DEFAULT_SENDER_PROFILE, name: "Ana", companyName: "Ana Sites" } },
    ],
  });
  return { admin };
}
