import { db } from "./db";
import { stockLevels, stockStatus, emptyLevel } from "./stock";

/** productId -> number of this store's submitted orders that included it (drafts and cancelled excluded). */
export async function popularProducts(storeId: string): Promise<Record<string, number>> {
  const rows = await db.orderItem.groupBy({
    by: ["productId"],
    where: { order: { storeId, status: { notIn: ["DRAFT", "CANCELLED"] } } },
    _count: { orderId: true },
  });
  return Object.fromEntries(rows.map((r) => [r.productId, r._count.orderId]));
}

/** productId -> "out" | "low" for the given tracked products only; partners see status, never quantities. */
export async function stockFlagsFor(ids: string[]): Promise<Record<string, "out" | "low">> {
  if (!ids.length) return {};
  const rows = await db.product.findMany({ where: { id: { in: ids }, trackStock: true }, select: { id: true, onHand: true, reserved: true, reorderLevel: true } });
  const out: Record<string, "out" | "low"> = {};
  for (const p of rows) {
    const st = stockStatus(true, { onHand: p.onHand, reserved: p.reserved, available: p.onHand - p.reserved }, p.reorderLevel);
    if (st === "out" || st === "low") out[p.id] = st;
  }
  return out;
}
