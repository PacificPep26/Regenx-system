import type { Tx } from "./db";
import { notify } from "./notify";

// A store's own stock at GP (bought with Inventory orders). Append-only `StoreStockMovement`:
//   on hand   = SUM(onHandDelta)     units physically kept for this store
//   reserved  = SUM(reservedDelta)   units promised to approved customer orders not yet shipped
//   available = on hand - reserved
// `StoreStock` is a trigger-maintained cache. Every writer holds the Store row lock (see lockStore in lib/orders.ts).

export type StoreLevel = { onHand: number; reserved: number; available: number };

export async function storeLevels(tx: Pick<Tx, "storeStock">, storeId: string, productIds?: string[]): Promise<Map<string, StoreLevel>> {
  const rows = await tx.storeStock.findMany({ where: { storeId, ...(productIds ? { productId: { in: productIds } } : {}) } });
  return new Map(rows.map((r) => [r.productId, { onHand: r.onHand, reserved: r.reserved, available: r.onHand - r.reserved }]));
}

/** Units currently reserved for one customer order, per product. */
export async function storeReserved(tx: Pick<Tx, "storeStockMovement">, orderId: string) {
  const rows = await tx.storeStockMovement.groupBy({ by: ["productId"], where: { orderId }, _sum: { reservedDelta: true } });
  return new Map(rows.map((r) => [r.productId, r._sum.reservedDelta ?? 0]));
}

type Line = { productId: string; qty: number; product: { name: string; strength: string } };

/** Throws a message when the store's own stock cannot cover these lines (writes nothing). */
export async function assertStoreStock(tx: Tx, storeId: string, items: Line[], fail: (m: string) => Error) {
  const levels = await storeLevels(tx, storeId, items.map((i) => i.productId));
  const short = items.filter((i) => (levels.get(i.productId)?.available ?? 0) < i.qty);
  if (short.length)
    throw fail("Not enough in your inventory: " + short.map((i) => `${i.product.name} ${i.product.strength} (need ${i.qty}, you have ${levels.get(i.productId)?.available ?? 0})`).join("; ") + ". Order inventory first.");
}

/** Customer order approved: promise units from the store's own stock; throws a message when it is not enough. */
export async function reserveStoreStock(tx: Tx, storeId: string, orderId: string, items: Line[], actorId: string | null, fail: (m: string) => Error) {
  await assertStoreStock(tx, storeId, items, fail);
  await tx.storeStockMovement.createMany({
    data: items.map((i) => ({ storeId, productId: i.productId, type: "RESERVE" as const, reservedDelta: i.qty, orderId, createdById: actorId })),
  });
  await checkStoreLow(tx, storeId, items.map((i) => i.productId));
}

/** After available stock changes: tell the store once when a product reaches its minimum, and re-arm when it recovers. */
export async function checkStoreLow(tx: Tx, storeId: string, productIds: string[]) {
  const rows = await tx.storeStock.findMany({
    where: { storeId, productId: { in: productIds }, OR: [{ reorderLevel: { gt: 0 } }, { lowNotified: true }] },
    include: { product: { select: { name: true, strength: true } }, store: { select: { slug: true } } },
  });
  for (const r of rows) {
    const available = r.onHand - r.reserved;
    const low = r.reorderLevel > 0 && available <= r.reorderLevel;
    if (low && !r.lowNotified) {
      await tx.storeStock.update({ where: { storeId_productId: { storeId, productId: r.productId } }, data: { lowNotified: true } });
      await notify(tx, { audience: "STORE", storeId, title: `${available <= 0 ? "Out of stock" : "Low stock"}: ${r.product.name} ${r.product.strength} (${available} available, minimum ${r.reorderLevel})`, link: `/s/${r.store.slug}/inventory` });
    } else if (!low && r.lowNotified) {
      await tx.storeStock.update({ where: { storeId_productId: { storeId, productId: r.productId } }, data: { lowNotified: false } });
    }
  }
}

/** Cancelled before shipping: give the reserved units back (no-op when nothing was reserved). */
export async function releaseStoreStock(tx: Tx, storeId: string, orderId: string, actorId: string | null) {
  const held = await storeReserved(tx, orderId);
  const data = [...held].filter(([, q]) => q > 0).map(([productId, q]) => ({ storeId, productId, type: "RELEASE" as const, reservedDelta: -q, orderId, createdById: actorId }));
  if (data.length) {
    await tx.storeStockMovement.createMany({ data });
    await checkStoreLow(tx, storeId, data.map((d) => d.productId));
  }
}

/** Shipping: take the reserved units out of the store's stock. */
export async function shipStoreStock(tx: Tx, storeId: string, orderId: string, actorId: string | null) {
  const held = await storeReserved(tx, orderId);
  const items = await tx.orderItem.findMany({ where: { orderId } });
  await tx.storeStockMovement.createMany({
    data: items.map((i) => ({ storeId, productId: i.productId, type: "SHIP" as const, onHandDelta: -i.qty, reservedDelta: -(held.get(i.productId) ?? 0), orderId, createdById: actorId })),
  });
}
