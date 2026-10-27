import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { AppError, NotFoundError } from "@/server/errors";
import { audit } from "@/server/security/audit";
import { hashPassword, passwordProblem } from "@/server/security/crypto";

export async function listUsers() {
  return db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true },
  });
}

export async function createUser(input: { name: string; email: string; role: Role; password: string }, actorId: string | null) {
  const email = input.email.trim().toLowerCase();
  const problem = passwordProblem(input.password);
  if (problem) throw new AppError(problem);
  if (await db.user.findUnique({ where: { email } })) throw new AppError("Já existe um usuário com este e-mail.");
  const user = await db.user.create({
    data: { name: input.name.trim(), email, role: input.role, passwordHash: await hashPassword(input.password) },
  });
  await audit({ userId: actorId, action: "user.create", entityType: "User", entityId: user.id, metadata: { role: input.role } });
  return user;
}

async function ensureAnotherActiveAdmin(userId: string) {
  const admins = await db.user.count({ where: { role: "ADMIN", active: true, id: { not: userId } } });
  if (admins === 0) throw new AppError("É necessário manter pelo menos um administrador ativo.");
}

export async function updateUser(userId: string, input: { role: Role; active: boolean }, actorId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("Usuário não encontrado.");
  if (user.role === "ADMIN" && (input.role !== "ADMIN" || !input.active)) await ensureAnotherActiveAdmin(userId);
  if (userId === actorId && !input.active) throw new AppError("Você não pode desativar o próprio usuário.");
  await db.user.update({ where: { id: userId }, data: { role: input.role, active: input.active } });
  if (!input.active) await db.session.deleteMany({ where: { userId } });
  await audit({ userId: actorId, action: "user.update", entityType: "User", entityId: userId, metadata: input });
}

export async function resetPassword(userId: string, password: string, actorId: string) {
  const problem = passwordProblem(password);
  if (problem) throw new AppError(problem);
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await db.session.deleteMany({ where: { userId } });
  await audit({ userId: actorId, action: "user.reset_password", entityType: "User", entityId: userId });
}
