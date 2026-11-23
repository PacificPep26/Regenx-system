import type { Tx } from "./db";
import { db } from "./db";
import { notify } from "./notify";
import { audit } from "./audit";

// Stock rules (GP warehouse). Append-only `StockMovement`:
//   on hand   = SUM(onHandDelta)      physical units at GP
//   reserved  = SUM(reservedDelta)    units promised to approved, not yet shipped orders
//   available = on hand - reserved
// RECEIPT/ADJUST change on hand; RESERVE/RELEASE change reserved; SHIP removes from both.
// Stock is only *enforced* for products with trackStock=true (shipping needs enough on hand).
// Orders are never blocked at submit: reserving more than is available shows up as a shortage for GP.

export type StockLevel = { onHand: number; reserved: number; available: number };
export type StockStatus = "untracked" | "out" | "low" | "ok";

export const emptyLevel: StockLevel = { onHand: 0, reserved: 0, available: 0 };

export function stockStatus(trackStock: boolean, level: StockLevel, reorderLevel: number): StockStatus {
  if (!trackStock) return "untracked";
  if (level.available <= 0) return "out";
  if (level.available <= reorderLevel) return "low";
  return "ok";
}

/** Cached on Product by DB triggers; all products with any movement when no ids are given. */
export async function stockLevels(productIds?: string[], tx: Tx | typeof db = db): Promise<Map<string, StockLevel>> {
  const rows = await tx.product.findMany({
    where: productIds ? { id: { in: productIds } } : { OR: [{ onHand: { not: 0 } }, { reserved: { not: 0 } }] },
    select: { id: true, onHand: true, reserved: true },
  });
  return new Map(rows.map((r) => [r.id, { onHand: r.onHand, reserved: r.reserved, available: r.onHand - r.reserved }]));
}

/** Units currently reserved for one order, per product (0 for orders approved before stock existed). */
async function reservedFor(tx: Tx, orderId: string) {
  const rows = await tx.stockMovement.groupBy({ by: ["productId"], where: { orderId }, _sum: { reservedDelta: true } });
  return new Map(rows.map((r) => [r.productId, r._sum.reservedDelta ?? 0]));
}

/** Order approved: promise the units. Idempotent (does nothing if already reserved). */
export async function reserveOrder(tx: Tx, orderId: string, actorId: string | null) {
  const [items, held] = await Promise.all([tx.orderItem.findMany({ where: { orderId } }), reservedFor(tx, orderId)]);
  const data = items
    .filter((i) => !(held.get(i.productId) ?? 0))
    .map((i) => ({ productId: i.productId, type: "RESERVE" as const, reservedDelta: i.qty, orderId, createdById: actorId }));
  if (data.length) await tx.stockMovement.createMany({ data });
}

/** Order cancelled before shipping: give the units back. */
export async function releaseOrder(tx: Tx, orderId: string, actorId: string | null) {
  const held = await reservedFor(tx, orderId);
  const data = [...held].filter(([, q]) => q > 0).map(([productId, q]) => ({ productId, type: "RELEASE" as const, reservedDelta: -q, orderId, createdById: actorId }));
  if (data.length) await tx.stockMovement.createMany({ data });
}

/**
 * Shipping: lock the products, refuse if a tracked product lacks physical stock, then take the units out
 * of on hand and out of this order's reservation. Returns products that dropped to/below their reorder level.
 */
export async function shipFromStock(tx: Tx, orderId: string, actorId: string | null) {
  const items = await tx.orderItem.findMany({ where: { orderId }, include: { product: true } });
  const ids = items.map((i) => i.productId);
  if (ids.length) await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ANY(${ids}) FOR UPDATE`;
  const [levels, held] = await Promise.all([stockLevels(ids, tx), reservedFor(tx, orderId)]);

  const short = items.filter((i) => i.product.trackStock && (levels.get(i.productId)?.onHand ?? 0) < i.qty);
  if (short.length)
    throw new StockError(
      "Not enough stock to ship: " + short.map((i) => `${i.product.name} ${i.product.strength} (need ${i.qty}, on hand ${levels.get(i.productId)?.onHand ?? 0})`).join("; "),
    );

  const data = items.map((i) => ({
    productId: i.productId,
    type: "SHIP" as const,
    onHandDelta: -i.qty,
    reservedDelta: -(held.get(i.productId) ?? 0),
    orderId,
    createdById: actorId,
  }));
  if (data.length) await tx.stockMovement.createMany({ data });

  // low-stock alerts for tracked products after this shipment
  const after = await stockLevels(ids, tx);
  const low = items.filter((i) => i.product.trackStock && stockStatus(true, after.get(i.productId) ?? emptyLevel, i.product.reorderLevel) !== "ok");
  for (const i of low)
    await notifyLow(tx, i.product, after.get(i.productId) ?? emptyLevel);
}

export async function notifyLow(tx: Tx, p: { id: string; name: string; strength: string }, l: StockLevel) {
  const title = `${l.available <= 0 ? "Out of stock" : "Low stock"}: ${p.name} ${p.strength} (${l.available} available)`;
  await notify(tx, { audience: "FULFILLMENT", title, link: "/stock?status=low" });
  await notify(tx, { audience: "ADMIN", title, link: "/stock?status=low" });
}

export class StockError extends Error {}

/** GP receives goods: on hand goes up and the product becomes tracked. */
export async function receiveStock(productId: string, qty: number, memo: string | undefined, actorId: string) {
  if (!Number.isInteger(qty) || qty <= 0) throw new StockError("Quantity must be a positive whole number.");
  return db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { trackStock: true } });
    await tx.stockMovement.create({ data: { productId, type: "RECEIPT", onHandDelta: qty, memo, createdById: actorId } });
    await audit(tx, actorId, "stock.receive", "Product", productId, { qty, memo: memo ?? null });
  });
}

/** Stock-take correction (+/-). A reason is required and on hand can never go below zero. */
export async function adjustStock(productId: string, delta: number, memo: string, actorId: string) {
  if (!Number.isInteger(delta) || delta === 0) throw new StockError("Adjustment must be a non-zero whole number.");
  if (memo.trim().length < 3) throw new StockError("A reason is required for stock adjustments.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    const p = await tx.product.findUniqueOrThrow({ where: { id: productId } });
    const level = (await stockLevels([productId], tx)).get(productId) ?? emptyLevel;
    if (level.onHand + delta < 0) throw new StockError(`On hand is ${level.onHand}; cannot remove ${-delta}.`);
    await tx.stockMovement.create({ data: { productId, type: "ADJUST", onHandDelta: delta, memo: memo.trim(), createdById: actorId } });
    await audit(tx, actorId, "stock.adjust", "Product", productId, { delta, memo });
    const after = { onHand: level.onHand + delta, reserved: level.reserved, available: level.onHand + delta - level.reserved };
    if (p.trackStock && stockStatus(true, after, p.reorderLevel) !== "ok") await notifyLow(tx, p, after);
  });
}

export async function updateStockSettings(productId: string, s: { trackStock: boolean; reorderLevel: number }, actorId: string) {
  if (!Number.isInteger(s.reorderLevel) || s.reorderLevel < 0) throw new StockError("Reorder level must be 0 or more.");
  return db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: s });
    await audit(tx, actorId, "stock.settings", "Product", productId, s);
  });
}
