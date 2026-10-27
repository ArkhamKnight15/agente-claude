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

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Administrador";

  if ((await db.user.count()) === 0) {
    if (!email || !password) {
      throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env para criar o primeiro administrador.");
    }
    const problem = passwordProblem(password);
    if (problem) throw new Error(`ADMIN_PASSWORD fraca: ${problem}`);
    await db.user.create({ data: { email, name, role: "ADMIN", passwordHash: await hashPassword(password) } });
    console.log(`✔ Administrador criado: ${email}`);
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
