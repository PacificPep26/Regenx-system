import "server-only";
import type { InventoryStatus } from "@prisma/client";
import { db } from "./db";
import { getBalances } from "./balances";
import { priceOrder, splitCharge, refundEntries } from "./ledger";
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

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** The units join the store's own stock (no GP step). */
async function stockIn(tx: Tx, o: { id: string; number: number; storeId: string; items: { productId: string; qty: number }[] }, actorId: string) {
  await tx.storeStockMovement.createMany({
    data: o.items.map((i) => ({ storeId: o.storeId, productId: i.productId, type: "RECEIPT" as const, onHandDelta: i.qty, inventoryOrderId: o.id, memo: `Inventory #${o.number}`, createdById: actorId })),
  });
  await checkStoreLow(tx, o.storeId, o.items.map((i) => i.productId));
}

/**
 * DRAFT -> RECEIVED. The cost of goods is charged now, at wholesale: from credit, and the part above credit becomes
 * outstanding and the order waits ON_HOLD for admin approval (the units join the store's stock when it is approved).
 * Customer orders later take units from this stock and are not charged for the goods again.
 * Only stores with a received deposit (ACTIVE) can add inventory.
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
    const bal = await getBalances(store.id, { tx });
    const { creditAppliedCents, overageCents } = splitCharge(bal.CREDIT, totalCents);
    const overdue = (await tx.statement.count({ where: { storeId: store.id, status: "OVERDUE" } })) > 0;
    if (overdue && overageCents > 0) throw new UserError("Additional ordering beyond your credit is paused: this store has an overdue statement. Add funds first.");

    const base = { storeId: store.id, inventoryOrderId: id, createdById: actor.id };
    if (creditAppliedCents > 0) await tx.ledgerEntry.create({ data: { ...base, bucket: "CREDIT", type: "ORDER_DEBIT", amountCents: -creditAppliedCents, memo: `Inventory #${o.number}` } });
    if (overageCents > 0) await tx.ledgerEntry.create({ data: { ...base, bucket: "OUTSTANDING", type: "OVERAGE", amountCents: overageCents, memo: `Inventory #${o.number} over credit` } });

    const status: InventoryStatus = overageCents > 0 ? "ON_HOLD" : "RECEIVED";
    const now = new Date();
    await tx.inventoryOrder.update({
      where: { id },
      data: { status, subtotalCents, discountBps: store.discountBps, totalCents, creditAppliedCents, overageCents, submittedAt: now, approvedAt: status === "RECEIVED" ? now : null, receivedAt: status === "RECEIVED" ? now : null },
    });
    const link = `/s/${store.slug}/inventory/orders/${id}`;
    if (status === "RECEIVED") {
      await stockIn(tx, { ...o, storeId: store.id }, actor.id);
      await notify(tx, { audience: "ADMIN", storeId: store.id, title: `Inventory added: ${store.name} #${o.number} · ${formatUSD(totalCents)}`, link });
      await notify(tx, { audience: "FULFILLMENT", storeId: store.id, title: `Inventory added for ${store.name} #${o.number}: ${o.items.reduce((n, i) => n + i.qty, 0)} unit(s)`, link: `/inventory?store=${store.slug}` });
    } else {
      await notify(tx, { audience: "ADMIN", storeId: store.id, title: `${store.name}: inventory #${o.number} over credit by ${formatUSD(overageCents)}`, link });
      await notify(tx, { audience: "STORE", storeId: store.id, title: `Inventory #${o.number} on hold: exceeds credit by ${formatUSD(overageCents)}. Request a top-up.`, link });
    }
    await audit(tx, actor.id, "inventory.submit", "InventoryOrder", id, { status, totalCents, creditAppliedCents, overageCents });
    return status;
  });
}

/** Admin approves an order held for going over credit: the units join the store's stock. */
export function approveInventoryHold(id: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const o = await tx.inventoryOrder.findUniqueOrThrow({ where: { id }, include: { items: true, store: true } });
    if (o.status !== "ON_HOLD") throw new UserError("Inventory order is not on hold.");
    const now = new Date();
    await tx.inventoryOrder.update({ where: { id }, data: { status: "RECEIVED", approvedAt: now, receivedAt: now } });
    await stockIn(tx, o, actor.id);
    await notify(tx, { audience: "FULFILLMENT", storeId: o.storeId, title: `Inventory added for ${o.store.name} #${o.number}: ${o.items.reduce((n, i) => n + i.qty, 0)} unit(s)`, link: `/inventory?store=${o.store.slug}` });
    await notify(tx, { audience: "STORE", storeId: o.storeId, title: `Inventory #${o.number} approved and added to your stock (overage billed next statement)`, link: `/s/${o.store.slug}/inventory/orders/${id}` });
    await audit(tx, actor.id, "inventory.approve_hold", "InventoryOrder", id);
  });
}

/** A draft or a held order can be cancelled (what was charged is reversed). One already in stock is fixed with Adjust. */
export function cancelInventoryOrder(id: string, actor: Actor, reason?: string) {
  return db.$transaction(async (tx) => {
    const head = await tx.inventoryOrder.findUniqueOrThrow({ where: { id }, select: { storeId: true } });
    await lockStore(tx, head.storeId);
    const o = await tx.inventoryOrder.findUniqueOrThrow({ where: { id }, include: { store: true } });
    const allowed: InventoryStatus[] = ["DRAFT", "ON_HOLD"];
    if (!allowed.includes(o.status)) throw new UserError(`Cannot cancel an inventory order that is ${o.status.toLowerCase().replace("_", " ")}.`);
    if (o.status !== "DRAFT")
      for (const e of refundEntries(o)) await tx.ledgerEntry.create({ data: { storeId: o.storeId, ...e, inventoryOrderId: id, createdById: actor.id, memo: `Cancel inventory #${o.number}` } });
    await tx.inventoryOrder.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: reason ? `${o.notes ?? ""}\nCancelled: ${reason}`.trim() : o.notes } });
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

/** GP (or admin): the physical count does not match the system. Tells the admin, who corrects it with Adjust (quantity only). */
export function reportCountMismatch(storeId: string, productId: string, counted: number, actor: Actor) {
  return db.$transaction(async (tx) => {
    if (actor.role !== "FULFILLMENT" && actor.role !== "ADMIN") throw new UserError("Only GP can report a count.");
    if (!Number.isInteger(counted) || counted < 0 || counted > 1_000_000) throw new UserError("Enter the counted units as a whole number, 0 or more.");
    const row = await tx.storeStock.findUnique({ where: { storeId_productId: { storeId, productId } }, include: { product: true, store: true } });
    if (!row) throw new UserError("This store has no stock of that product.");
    if (counted === row.onHand) throw new UserError("That matches the system, nothing to report.");
    const diff = counted - row.onHand;
    await notify(tx, {
      audience: "ADMIN",
      storeId,
      title: `Count mismatch · ${row.store.name} · ${row.product.name} ${row.product.strength}: system ${row.onHand}, counted ${counted} (${diff > 0 ? "+" : ""}${diff})`,
      body: "Check the shelf, then fix the number with Adjust on the store's Inventory page.",
      link: `/s/${row.store.slug}/inventory`,
    });
    await audit(tx, actor.id, "inventory.count_mismatch", "Store", storeId, { productId, system: row.onHand, counted });
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
