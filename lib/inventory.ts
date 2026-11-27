import "server-only";
import type { InventoryStatus } from "@prisma/client";
import { db } from "./db";
import { priceOrder } from "./ledger";
import { audit } from "./audit";
import { notify } from "./notify";
import { formatUSD } from "./money";
import { lockStore, UserError } from "./orders";
import { checkStoreLow } from "./storeStock";

// Inventory orders: a store buys stock up front, GP keeps it for the store, customer orders are then filled from it.
// Money works like a customer order used to: charged to prepaid credit at submit, the part above credit becomes
// outstanding and the order waits ON_HOLD for admin approval. Stock only becomes usable once GP marks it RECEIVED.

type Actor = { id: string; role: string };

export const INVENTORY_STATUSES = ["DRAFT", "ON_HOLD", "APPROVED", "RECEIVED", "CANCELLED"] as const;

/** Creates a DRAFT inventory order (each product once). Returns its id. */
export async function createInventoryDraft(storeId: string, actorId: string, input: { items: { productId: string; qty: number }[]; notes?: string }) {
  if (!input.items.length) throw new UserError("Add at least one product.");
  if (input.items.length !== new Set(input.items.map((i) => i.productId)).size) throw new UserError("Each product can appear only once.");
  if (input.items.some((i) => !Number.isInteger(i.qty) || i.qty < 1)) throw new UserError("Quantities must be whole numbers above zero.");
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  if (!store.inventoryMode) throw new UserError("Inventory orders are not enabled for this store.");
  const products = await db.product.findMany({ where: { id: { in: input.items.map((i) => i.productId) }, active: true } });
  if (products.length !== input.items.length) throw new UserError("Some products are unavailable.");
  const price = new Map(products.map((p) => [p.id, p.basePriceCents]));
  return db.$transaction(async (tx) => {
    await lockStore(tx, storeId);
    const { nextInventoryNumber } = await tx.store.update({ where: { id: storeId }, data: { nextInventoryNumber: { increment: 1 } } });
    const o = await tx.inventoryOrder.create({
      data: {
        storeId,
        number: nextInventoryNumber - 1,
        notes: input.notes?.trim() || null,
        items: { create: input.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPriceCents: price.get(i.productId)! })) },
      },
    });
    await audit(tx, actorId, "inventory.create", "InventoryOrder", o.id);
    return o.id;
  });
}

/**
 * DRAFT -> RECEIVED in one step: the units join the store's stock right away (no GP click needed).
 * Nothing is charged: the cost of goods is deducted when a customer order is processed.
 * Only stores with a received deposit (ACTIVE) can stock up. Prices are stored to show the inventory's value.
 */
export function submitInventoryOrder(id: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const head = await tx.inventoryOrder.findUniqueOrThrow({ where: { id }, select: { storeId: true } });
    await lockStore(tx, head.storeId);
    const o = await tx.inventoryOrder.findUniqueOrThrow({ where: { id }, include: { items: { include: { product: true } }, store: true } });
    const store = o.store;
    if (o.status !== "DRAFT") throw new UserError("Only draft inventory orders can be submitted.");
    if (store.status !== "ACTIVE") throw new UserError("Your deposit has not been received yet. You can add inventory once your account is active.");
    for (const i of o.items) {
      if (!i.product.active) throw new UserError(`${i.product.sku} is not available.`);
      if (i.product.restricted && !store.allowRestricted) throw new UserError(`${i.product.sku} is restricted for this store.`);
    }
    for (const i of o.items)
      if (i.unitPriceCents !== i.product.basePriceCents) await tx.inventoryOrderItem.update({ where: { id: i.id }, data: { unitPriceCents: i.product.basePriceCents } });
    const { subtotalCents, totalCents } = priceOrder(o.items.map((i) => ({ qty: i.qty, unitPriceCents: i.product.basePriceCents })), store.discountBps);
    const now = new Date();
    await tx.inventoryOrder.update({ where: { id }, data: { status: "RECEIVED", subtotalCents, discountBps: store.discountBps, totalCents, creditAppliedCents: 0, overageCents: 0, submittedAt: now, approvedAt: now, receivedAt: now } });
    await tx.storeStockMovement.createMany({
      data: o.items.map((i) => ({ storeId: store.id, productId: i.productId, type: "RECEIPT" as const, onHandDelta: i.qty, inventoryOrderId: id, memo: `Inventory #${o.number}`, createdById: actor.id })),
    });
    await checkStoreLow(tx, store.id, o.items.map((i) => i.productId));
    await notify(tx, { audience: "ADMIN", storeId: store.id, title: `Inventory added: ${store.name} #${o.number} · value ${formatUSD(totalCents)}`, link: `/s/${store.slug}/inventory/orders/${id}` });
    await audit(tx, actor.id, "inventory.submit", "InventoryOrder", id, { totalCents });
  });
}

/** Only a draft can be cancelled (a submitted one is already in stock; the admin fixes counts with Adjust). Nothing was charged. */
export function cancelInventoryOrder(id: string, actor: Actor, reason?: string) {
  return db.$transaction(async (tx) => {
    const head = await tx.inventoryOrder.findUniqueOrThrow({ where: { id }, select: { storeId: true } });
    await lockStore(tx, head.storeId);
    const o = await tx.inventoryOrder.findUniqueOrThrow({ where: { id }, include: { store: true } });
    const allowed: InventoryStatus[] = ["DRAFT"];
    if (!allowed.includes(o.status)) throw new UserError(`Cannot cancel an inventory order that is ${o.status.toLowerCase().replace("_", " ")}.`);
    await tx.inventoryOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: reason ? `${o.notes ?? ""}
Cancelled: ${reason}`.trim() : o.notes } });
    if (o.status !== "DRAFT") await notify(tx, { audience: actor.role === "ADMIN" ? "STORE" : "ADMIN", storeId: o.storeId, title: `Inventory #${o.number} cancelled`, body: reason, link: `/s/${o.store.slug}/inventory/orders/${id}` });
    await audit(tx, actor.id, "inventory.cancel", "InventoryOrder", id, { from: o.status, reason });
  });
}

/** GP: the goods are in the store's stock at GP. Adds the units to the store's on-hand. */
export function receiveInventoryOrder(id: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const head = await tx.inventoryOrder.findUniqueOrThrow({ where: { id }, select: { storeId: true } });
    await lockStore(tx, head.storeId);
    const o = await tx.inventoryOrder.findUniqueOrThrow({ where: { id }, include: { items: true, store: true } });
    if (o.status !== "APPROVED") throw new UserError("Only approved inventory orders can be stocked.");
    await tx.storeStockMovement.createMany({
      data: o.items.map((i) => ({ storeId: o.storeId, productId: i.productId, type: "RECEIPT" as const, onHandDelta: i.qty, inventoryOrderId: id, memo: `Inventory #${o.number}`, createdById: actor.id })),
    });
    await checkStoreLow(tx, o.storeId, o.items.map((i) => i.productId));
    await tx.inventoryOrder.update({ where: { id }, data: { status: "RECEIVED", receivedAt: new Date() } });
    await notify(tx, { audience: "STORE", storeId: o.storeId, title: `Inventory order #${o.number} is in your stock`, link: `/s/${o.store.slug}/inventory` });
    await audit(tx, actor.id, "inventory.receive", "InventoryOrder", id);
  });
}

/** Admin: fix a stock count that is off. Quantity only (no money moves); needs a reason and cannot drop below what is reserved. */
export function adjustStoreStock(storeId: string, productId: string, delta: number, reason: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    if (actor.role !== "ADMIN") throw new UserError("Only an admin can adjust a store's stock.");
    if (!Number.isInteger(delta) || delta === 0) throw new UserError("Enter a whole number other than zero.");
    if (reason.trim().length < 3) throw new UserError("A reason is required.");
    await lockStore(tx, storeId);
    const row = await tx.storeStock.findUnique({ where: { storeId_productId: { storeId, productId } }, include: { product: true, store: true } });
    const onHand = row?.onHand ?? 0;
    if (onHand + delta < 0) throw new UserError("On hand cannot be negative.");
    if (onHand + delta < (row?.reserved ?? 0)) throw new UserError(`On hand cannot go below the ${row?.reserved ?? 0} reserved for open orders.`);
    const product = row?.product ?? (await tx.product.findUniqueOrThrow({ where: { id: productId } }));
    const store = row?.store ?? (await tx.store.findUniqueOrThrow({ where: { id: storeId } }));
    await tx.storeStockMovement.create({ data: { storeId, productId, type: "ADJUST", onHandDelta: delta, memo: reason.trim().slice(0, 200), createdById: actor.id } });
    await checkStoreLow(tx, storeId, [productId]);
    await notify(tx, { audience: "STORE", storeId, title: `Stock adjusted: ${product.name} ${product.strength} ${delta > 0 ? "+" : ""}${delta}`, body: reason.trim(), link: `/s/${store.slug}/inventory/history` });
    await audit(tx, actor.id, "inventory.adjust", "Store", storeId, { productId, delta, reason });
  });
}

/** Store owner (or admin): the minimum at which the store wants to be told a product is running low. */
export function setReorderLevel(storeId: string, productId: string, level: number, actor: Actor) {
  return db.$transaction(async (tx) => {
    if (actor.role !== "ADMIN" && actor.role !== "PARTNER_OWNER") throw new UserError("Only the store owner can change this.");
    if (!Number.isInteger(level) || level < 0 || level > 1_000_000) throw new UserError("Enter a whole number, 0 or more.");
    await lockStore(tx, storeId);
    const row = await tx.storeStock.findUnique({ where: { storeId_productId: { storeId, productId } } });
    if (!row) throw new UserError("This product is not in your stock.");
    await tx.storeStock.update({ where: { storeId_productId: { storeId, productId } }, data: { reorderLevel: level } });
    await checkStoreLow(tx, storeId, [productId]);
    await audit(tx, actor.id, "inventory.reorder_level", "Store", storeId, { productId, level });
  });
}
