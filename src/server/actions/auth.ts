"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { createSession, destroySession, getClientIp, getCurrentUser } from "@/server/auth/session";
import { audit } from "@/server/security/audit";
import { hashPassword, verifyPassword } from "@/server/security/crypto";
import { hitRateLimit, resetRateLimit } from "@/server/security/rate-limit";
import type { ActionState } from "./helpers";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
  next: z.string().optional(),
});

// Hash fixo para igualar o tempo de resposta quando o e-mail não existe.
let dummyHash: Promise<string> | null = null;

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/";
}

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Verifique os campos.", fieldErrors: z.flattenError(parsed.error).fieldErrors, at: Date.now() };
  }
  const { email, password, next } = parsed.data;
  const ip = (await getClientIp()) ?? "desconhecido";

  const [byIp, byEmail] = await Promise.all([
    hitRateLimit(`login:ip:${ip}`, 30, 15 * 60),
    hitRateLimit(`login:email:${email}`, 6, 15 * 60),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    await audit({ action: "auth.login_rate_limited", metadata: { email }, ip });
    return { ok: false, error: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente.", at: Date.now() };
  }

  const user = await db.user.findUnique({ where: { email } });
  dummyHash ??= hashPassword("senha-ficticia-para-tempo-constante");
  const valid = user ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, await dummyHash), false);

  if (!user || !valid || !user.active) {
    await audit({ userId: user?.id ?? null, action: "auth.login_failed", metadata: { email, reason: user && !user.active ? "inactive" : "invalid" }, ip });
    return { ok: false, error: "E-mail ou senha incorretos.", at: Date.now() };
  }

  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await resetRateLimit(`login:email:${email}`);
  await audit({ userId: user.id, action: "auth.login", ip });
  redirect(safeNext(next));
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit({ userId: user.id, action: "auth.logout" });
  redirect("/login");
}
