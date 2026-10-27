import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { getEnv } from "@/server/env";
import { createLogger } from "@/server/logger";
import { parseWhatsappWebhook, verifyWebhookSignature } from "@/server/integrations/whatsapp";
import { hitRateLimit } from "@/server/security/rate-limit";
import { safeEqual } from "@/server/security/crypto";
import { kickQueue } from "@/server/jobs/kick";
import { logEvent } from "@/server/services/events";
import { applyWhatsappStatus, recordInboundWhatsapp } from "@/server/services/messages";

const log = createLogger("webhook.whatsapp");

/** Verificação do webhook pela Meta (hub.challenge). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = getEnv().WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (params.get("hub.mode") === "subscribe" && token && safeEqual(params.get("hub.verify_token") ?? "", token)) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Token de verificação inválido." }, { status: 403 });
}

/** Eventos: mensagens recebidas e status de entrega. Sempre responde rápido (200) após validar. */
export async function POST(request: Request) {
  const secret = getEnv().WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "meta";
  if (!(await hitRateLimit(`webhook:wa:${ip}`, 600, 60)).allowed) return NextResponse.json({ error: "Limite excedido." }, { status: 429 });

  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    await logEvent({ level: "WARN", source: "webhook.whatsapp", message: "Assinatura inválida — requisição rejeitada." });
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const events = parseWhatsappWebhook(payload);
  for (const event of events) {
    const externalId = `${event.kind}:${event.providerMessageId}:${event.kind === "status" ? event.status : ""}`;
    // Idempotência: a Meta pode reenviar o mesmo evento.
    const stored = await db.webhookEvent
      .create({ data: { provider: "whatsapp", externalId, payload: event as unknown as Prisma.InputJsonValue } })
      .catch((e: { code?: string }) => (e.code === "P2002" ? null : Promise.reject(e)));
    if (!stored) continue;
    try {
      if (event.kind === "message") await recordInboundWhatsapp(event);
      else await applyWhatsappStatus(event);
      await db.webhookEvent.update({ where: { id: stored.id }, data: { processedAt: new Date() } });
    } catch (error) {
      log.error("Falha ao processar evento", { error, kind: event.kind });
      await db.webhookEvent.update({ where: { id: stored.id }, data: { error: (error as Error).message.slice(0, 500) } });
      await logEvent({ level: "ERROR", source: "webhook.whatsapp", message: `Falha ao processar evento: ${(error as Error).message}` });
    }
  }
  // Classifica as respostas logo em seguida (sem esperar o próximo ciclo do cron).
  if (events.some((e) => e.kind === "message")) kickQueue(30_000);
  return NextResponse.json({ ok: true, processed: events.length });
}
