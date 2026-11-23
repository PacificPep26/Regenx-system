import { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";

/**
 * New orders per store since this user last opened that store's Orders page, in a single query.
 * Admin: newly submitted orders. GP: newly approved (ready to pack). Partners: none (they create them).
 */
export async function newOrderCounts(u: CurrentUser, _storeIds?: string[]) {
  const out = new Map<string, number>();
  if (u.role !== "ADMIN" && u.role !== "FULFILLMENT") return out;
  const col = Prisma.raw(u.role === "ADMIN" ? '"submittedAt"' : '"approvedAt"');
  const rows = await db.$queryRaw<{ storeId: string; n: number }[]>`
    SELECT o."storeId", COUNT(*)::int AS n
    FROM "Order" o
    LEFT JOIN "StoreSeen" s ON s."storeId" = o."storeId" AND s."userId" = ${u.id}
    WHERE o.status <> 'DRAFT' AND o.${col} > COALESCE(s."ordersSeenAt", ${u.createdAt})
    GROUP BY o."storeId"`;
  for (const r of rows) out.set(r.storeId, r.n);
  return out;
}
