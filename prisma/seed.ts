import "dotenv/config";
import { db } from "@/server/db";
import { hashPassword, passwordProblem } from "@/server/security/crypto";
import {
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_CONTACT_POLICY,
  DEFAULT_SENDER_PROFILE,
  SETTING_KEYS,
} from "@/lib/settings-schema";

/**
 * Seed idempotente: administrador inicial, pacote de serviço padrão (R$ 500) e
 * configurações padrão. Não cria dados de empresas.
 */

/** Valor de variável sem espaços nem aspas em volta (no painel da Vercel o valor é literal). */
function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  return value || undefined;
}

async function main() {
  const email = envValue("ADMIN_EMAIL")?.toLowerCase();
  const password = envValue("ADMIN_PASSWORD");
  const name = envValue("ADMIN_NAME") || "Administrador";
  const resetPassword = ["1", "true", "sim"].includes(envValue("ADMIN_RESET_PASSWORD")?.toLowerCase() ?? "");

  if (resetPassword || (await db.user.count()) === 0) {
    if (!email || !password) {
      throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env para criar o primeiro administrador.");
    }
    const problem = passwordProblem(password);
    if (problem) throw new Error(`ADMIN_PASSWORD fraca: ${problem}`);
    const passwordHash = await hashPassword(password);
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      // Redefinição explícita: troca a senha, garante acesso de administrador, encerra as sessões e libera o bloqueio de login.
      await db.user.update({ where: { id: existing.id }, data: { passwordHash, role: "ADMIN", active: true } });
      await db.session.deleteMany({ where: { userId: existing.id } });
      await db.rateLimitBucket.deleteMany({ where: { key: `login:email:${email}` } });
      console.log(`✔ Senha do administrador redefinida: ${email} — remova ADMIN_RESET_PASSWORD das variáveis.`);
    } else {
      await db.user.create({ data: { email, name, role: "ADMIN", passwordHash } });
      console.log(`✔ Administrador criado: ${email}`);
    }
  } else {
    console.log("• Usuários já existem — administrador não recriado.");
  }

  if ((await db.servicePackage.count()) === 0) {
    await db.servicePackage.create({
      data: {
        name: "Site Profissional Essencial",
        description: "Site de uma página, moderno e adaptado para celular, para apresentar o negócio e gerar contatos pelo WhatsApp.",
        price: 500,
        deliveryDays: 10,
        revisions: 2,
        isDefault: true,
        features: [
          "Site de página única com até 6 seções",
          "Layout responsivo (celular, tablet e computador)",
          "Botão de WhatsApp e links para as redes sociais",
          "Mapa de localização e horário de funcionamento",
          "Otimização básica para buscadores (títulos, descrição e velocidade)",
          "Até 2 rodadas de ajustes no layout",
        ],
        notIncluded: [
          "Hospedagem do site",
          "Registro de domínio",
          "Manutenção mensal ou suporte contínuo",
          "Criação de logotipo e identidade visual",
          "Produção de textos e fotos profissionais",
          "Loja virtual ou pagamentos online",
        ],
        clientResponsibilities: [
          "Enviar textos, fotos, logotipo e informações de contato",
          "Contratar hospedagem e domínio (podemos orientar na escolha)",
          "Revisar e aprovar o layout em até 5 dias úteis",
        ],
        paymentTerms: "50% na aprovação da proposta e 50% na entrega, via Pix ou transferência.",
        supportTerms: "Correção de erros técnicos por 30 dias após a entrega. Manutenção contínua não está incluída.",
      },
    });
    console.log("✔ Pacote padrão criado (R$ 500,00)");
  }

  const defaults: Array<[string, object]> = [
    [SETTING_KEYS.agent, DEFAULT_AGENT_SETTINGS],
    [SETTING_KEYS.contactPolicy, DEFAULT_CONTACT_POLICY],
    [SETTING_KEYS.senderProfile, { ...DEFAULT_SENDER_PROFILE, name: process.env.SENDER_NAME ?? "" }],
  ];
  for (const [key, value] of defaults) {
    await db.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  console.log("✔ Configurações padrão garantidas");
}

main()
  .catch((error) => {
    console.error(`✖ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
