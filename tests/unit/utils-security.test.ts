import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { escapeCsvCell, toCsv } from "@/lib/csv";
import { formatBRL, parseBRL } from "@/lib/format";
import { maskPhone, normalizeBrazilPhone, waMeLink } from "@/lib/phone";
import { twoProportionTest } from "@/lib/stats";
import { diceSimilarity, normalizeBusinessName } from "@/lib/text";
import { parseWhatsappWebhook, verifyWebhookSignature } from "@/server/integrations/whatsapp";
import { stripQuotedReply } from "@/server/integrations/email";
import { hashPassword, passwordProblem, signToken, verifyPassword, verifySignedToken } from "@/server/security/crypto";
import { can } from "@/server/security/rbac";

describe("telefones brasileiros", () => {
  it.each([
    ["(11) 98765-4321", "+5511987654321", "MOBILE"],
    ["+55 19 3232-1010", "+551932321010", "LANDLINE"],
    ["011 98765 4321", "+5511987654321", "MOBILE"],
    ["0 21 21 98765-4321", "+5521987654321", "MOBILE"],
    ["5541999998888", "+5541999998888", "MOBILE"],
  ])("%s → %s", (raw, e164, type) => {
    const p = normalizeBrazilPhone(raw);
    expect(p?.e164).toBe(e164);
    expect(p?.type).toBe(type);
  });

  it("rejeita números inválidos e não geográficos", () => {
    for (const raw of ["0800 123 4567", "(00) 98765-4321", "123", "(11) 1234-5678", ""]) expect(normalizeBrazilPhone(raw)).toBeNull();
  });

  it("gera link wa.me e mascara para logs", () => {
    expect(waMeLink("+5511987654321", "Olá!")).toBe("https://wa.me/5511987654321?text=Ol%C3%A1!");
    expect(maskPhone("+5511987654321")).toBe("+5511****4321");
  });
});

describe("texto, moeda e CSV", () => {
  it("normaliza nomes comerciais", () => {
    expect(normalizeBusinessName("Auto Center João LTDA - ME")).toBe("auto center joao");
    expect(diceSimilarity("Barbearia do Zé", "Barbearia do Ze")).toBe(1);
  });

  it("formata e lê valores em reais", () => {
    expect(formatBRL(500)).toMatch(/R\$\s?500,00/);
    expect(parseBRL("1.234,56")).toBe(1234.56);
    expect(parseBRL("500")).toBe(500);
  });

  it("escapa CSV e evita injeção de fórmulas", () => {
    expect(escapeCsvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(escapeCsvCell('a;b"c')).toBe('"a;b""c"');
    expect(toCsv([{ a: 1 }], [{ header: "A", value: (r) => r.a }]).startsWith("﻿A\r\n1")).toBe(true);
  });

  it("teste de duas proporções", () => {
    expect(twoProportionTest(30, 100, 10, 100)!.significant).toBe(true);
    expect(twoProportionTest(5, 20, 4, 20)!.significant).toBe(false);
  });
});

describe("segurança", () => {
  it("hash de senha com scrypt e regras de senha forte", async () => {
    const hash = await hashPassword("Senha!Forte123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Senha!Forte123", hash)).toBe(true);
    expect(await verifyPassword("errada", hash)).toBe(false);
    expect(passwordProblem("curta")).not.toBeNull();
    expect(passwordProblem("Senha!Forte123")).toBeNull();
  });

  it("tokens assinados detectam adulteração", () => {
    const token = signToken({ l: "lead1" }, "unsubscribe");
    expect(verifySignedToken(token, "unsubscribe")).toEqual({ l: "lead1" });
    expect(verifySignedToken(token, "outro-proposito")).toBeNull();
    expect(verifySignedToken(`${token.slice(0, -2)}xx`, "unsubscribe")).toBeNull();
  });

  it("permissões por papel", () => {
    expect(can("ADMIN", "proposal:approve")).toBe(true);
    expect(can("OPERATOR", "proposal:approve")).toBe(false);
    expect(can("OPERATOR", "message:approve")).toBe(true);
    expect(can("VIEWER", "lead:write")).toBe(false);
  });
});

describe("WhatsApp Cloud API — webhooks", () => {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      contacts: [{ wa_id: "5511987654321", profile: { name: "João" } }],
      messages: [{ id: "wamid.1", from: "5511987654321", timestamp: "1767225600", type: "text", text: { body: "Tenho interesse" } }],
      statuses: [{ id: "wamid.out", status: "read", timestamp: "1767225600", recipient_id: "5511987654321" }],
    } }] }],
  });

  it("valida a assinatura X-Hub-Signature-256", () => {
    const sig = `sha256=${createHmac("sha256", "segredo").update(body).digest("hex")}`;
    expect(verifyWebhookSignature(body, sig, "segredo")).toBe(true);
    expect(verifyWebhookSignature(body, sig, "outro")).toBe(false);
    expect(verifyWebhookSignature(body, null, "segredo")).toBe(false);
  });

  it("extrai mensagens e status", () => {
    const events = parseWhatsappWebhook(JSON.parse(body));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "message", fromE164: "+5511987654321", text: "Tenho interesse", profileName: "João" });
    expect(events[1]).toMatchObject({ kind: "status", status: "read", providerMessageId: "wamid.out" });
  });

  it("remove o histórico citado de respostas por e-mail", () => {
    expect(stripQuotedReply("Pode mandar!\n\nEm seg., 10 de nov. de 2026 às 10:00, Ana escreveu:\n> Olá")).toBe("Pode mandar!");
  });
});
