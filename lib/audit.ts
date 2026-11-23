import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";

export function audit(tx: Tx, actorId: string | null, action: string, entity: string, entityId: string, data?: Prisma.InputJsonValue) {
  return tx.auditLog.create({ data: { actorId, action, entity, entityId, data } });
}
