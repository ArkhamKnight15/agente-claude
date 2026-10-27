import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";
import { createLogger } from "@/server/logger";

const log = createLogger("audit");

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Registra ações relevantes (login, aprovações, envios, exclusões, exportações...). */
export async function audit(entry: AuditEntry, tx?: Tx): Promise<void> {
  try {
    await (tx ?? db).auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    // Auditoria nunca deve derrubar a operação principal, mas a falha fica registrada.
    log.error("Falha ao gravar auditoria", { action: entry.action, error });
  }
}
