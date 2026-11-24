import "server-only";
import type { OrderStatus } from "@prisma/client";
import { db, type Tx } from "./db";
import { getBalances } from "./balances";
import { priceOrder, splitCharge, refundEntries, allocatePayment } from "./ledger";
import { audit } from "./audit";
import { notify } from "./notify";
import { formatUSD } from "./money";
import { reserveOrder, releaseOrder, shipFromStock, StockError } from "./stock";

export class UserError extends Error {}

type Actor = { id: string; role: string };

const lockStore = (tx: Tx, storeId: string) => tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;

export const regionAllowed = (allowed: string[], country: string, region: string) =>
  allowed.includes(country.toUpperCase()) || allowed.includes(`${country}-${region}`.toUpperCase());

/** DRAFT -> APPROVED (fully covered) or ON_HOLD (overage awaiting admin approval). */
export function submitOrder(orderId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const head = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { storeId: true } });
    await lockStore(tx, head.storeId);
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { product: true } }, store: true },
    });
    const store = order.store;
    if (order.status !== "DRAFT") throw new UserError("Only draft orders can be submitted.");
    if (store.status !== "ACTIVE") throw new UserError("Store is not active.");
    const overdue = (await tx.statement.count({ where: { storeId: store.id, status: "OVERDUE" } })) > 0;
    if (!regionAllowed(store.allowedRegions, order.shipCountry, order.shipRegion))
      throw new UserError(`Shipping to ${order.shipCountry}-${order.shipRegion} is not authorized for this store.`);
    for (const i of order.items) {
      if (!i.product.active) throw new UserError(`${i.product.sku} is not available.`);
      if (i.product.restricted && !store.allowRestricted) throw new UserError(`${i.product.sku} is restricted for this store.`);
    }

    // re-price at submit time from the current catalog
    for (const i of order.items)
      if (i.unitPriceCents !== i.product.basePriceCents)
        await tx.orderItem.update({ where: { id: i.id }, data: { unitPriceCents: i.product.basePriceCents } });
    const { subtotalCents, totalCents } = priceOrder(
      order.items.map((i) => ({ qty: i.qty, unitPriceCents: i.product.basePriceCents })),
      store.discountBps,
    );
    const bal = await getBalances(store.id, { tx });
    const { creditAppliedCents, overageCents } = splitCharge(bal.CREDIT, totalCents);
    // Program rule: with an unsettled statement RegenX may limit *additional* fulfillment (beyond the prepaid credit);
    // orders fully covered by credit still go through.
    if (overdue && overageCents > 0)
      throw new UserError("Additional fulfillment beyond your credit is paused: this store has an overdue statement. Orders within your available credit are still accepted.");

    if (creditAppliedCents > 0)
      await tx.ledgerEntry.create({
        data: { storeId: store.id, bucket: "CREDIT", type: "ORDER_DEBIT", amountCents: -creditAppliedCents, orderId, createdById: actor.id, memo: `Order #${order.number}` },
      });
    if (overageCents > 0)
      await tx.ledgerEntry.create({
        data: { storeId: store.id, bucket: "OUTSTANDING", type: "OVERAGE", amountCents: overageCents, orderId, createdById: actor.id, memo: `Order #${order.number} over credit` },
      });

    const status: OrderStatus = overageCents > 0 ? "ON_HOLD" : "APPROVED";
    const now = new Date();
    await tx.order.update({
      where: { id: orderId },
      data: {
        status,
        subtotalCents,
        discountBps: store.discountBps,
        totalCents,
        creditAppliedCents,
        overageCents,
        submittedAt: now,
        approvedAt: status === "APPROVED" ? now : null,
      },
    });
    if (status === "APPROVED") await reserveOrder(tx, orderId, actor.id);
    const link = `/s/${store.slug}/orders/${orderId}`;
    if (status === "ON_HOLD") {
      await notify(tx, { audience: "ADMIN", storeId: store.id, title: `${store.name}: order #${order.number} over credit by ${formatUSD(overageCents)}`, link });
      await notify(tx, { audience: "STORE", storeId: store.id, title: `Order #${order.number} on hold: exceeds credit by ${formatUSD(overageCents)}`, link });
    } else {
      await notify(tx, { audience: "ADMIN", storeId: store.id, title: `New order ${store.name} #${order.number} · ${formatUSD(totalCents)}`, link });
      await notify(tx, { audience: "FULFILLMENT", storeId: store.id, title: `New order ${store.name} #${order.number}`, link: `/fulfillment/${orderId}` });
    }
    await audit(tx, actor.id, "order.submit", "Order", orderId, { status, totalCents, creditAppliedCents, overageCents });
    return status;
  });
}

export function approveHold(orderId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { store: true } });
    if (o.status !== "ON_HOLD") throw new UserError("Order is not on hold.");
    await tx.order.update({ where: { id: orderId }, data: { status: "APPROVED", approvedAt: new Date() } });
    await reserveOrder(tx, orderId, actor.id);
    await notify(tx, { audience: "STORE", storeId: o.storeId, title: `Order #${o.number} approved (overage billed next statement)`, link: `/s/${o.store.slug}/orders/${orderId}` });
    await notify(tx, { audience: "FULFILLMENT", storeId: o.storeId, title: `New order ${o.store.name} #${o.number}`, link: `/fulfillment/${orderId}` });
    await audit(tx, actor.id, "order.approve_hold", "Order", orderId);
  });
}

const PARTNER_CANCELLABLE: OrderStatus[] = ["DRAFT", "ON_HOLD", "APPROVED"];
const ADMIN_CANCELLABLE: OrderStatus[] = [...PARTNER_CANCELLABLE, "PACKING"];

export function cancelOrder(orderId: string, actor: Actor, reason?: string) {
  return db.$transaction(async (tx) => {
    const head = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { storeId: true } });
    await lockStore(tx, head.storeId);
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { store: true } });
    const allowed = actor.role === "ADMIN" ? ADMIN_CANCELLABLE : PARTNER_CANCELLABLE;
    if (!allowed.includes(o.status)) throw new UserError(`Cannot cancel an order that is ${o.status.toLowerCase()}.`);
    if (o.status !== "DRAFT")
      for (const e of refundEntries(o))
        await tx.ledgerEntry.create({ data: { storeId: o.storeId, ...e, orderId, createdById: actor.id, memo: `Cancel #${o.number}` } });
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: reason ? `${o.notes ?? ""}\nCancelled: ${reason}`.trim() : o.notes } });
    await releaseOrder(tx, orderId, actor.id);
    const link = `/s/${o.store.slug}/orders/${orderId}`;
    if (o.status !== "DRAFT") {
      await notify(tx, { audience: actor.role === "ADMIN" ? "STORE" : "ADMIN", storeId: o.storeId, title: `Order #${o.number} cancelled`, body: reason, link });
      if (o.status === "APPROVED" || o.status === "PACKING")
        await notify(tx, { audience: "FULFILLMENT", storeId: o.storeId, title: `Cancelled: ${o.store.name} #${o.number}`, link: `/fulfillment/${orderId}` });
    }
    await audit(tx, actor.id, "order.cancel", "Order", orderId, { from: o.status, reason });
  });
}

export function startPacking(orderId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.status !== "APPROVED") throw new UserError("Only approved orders can be packed.");
    await tx.order.update({ where: { id: orderId }, data: { status: "PACKING", packedAt: new Date() } });
    await audit(tx, actor.id, "order.packing", "Order", orderId);
  });
}

export function markShipped(orderId: string, actor: Actor, s: { carrier: string; trackingNo: string; shippingFeeCents: number }) {
  return db.$transaction(async (tx) => {
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { store: true } });
    if (o.status !== "PACKING" && o.status !== "APPROVED") throw new UserError("Order is not ready to ship.");
    if (s.shippingFeeCents < 0) throw new UserError("Shipping fee cannot be negative.");
    try {
      await shipFromStock(tx, orderId, actor.id);
    } catch (e) {
      if (e instanceof StockError) throw new UserError(e.message);
      throw e;
    }
    // shipping is billed in its own bucket and never reduces purchasing credit
    if (s.shippingFeeCents > 0)
      await tx.ledgerEntry.create({
        data: { storeId: o.storeId, bucket: "SHIPPING", type: "SHIPPING_CHARGE", amountCents: s.shippingFeeCents, orderId, createdById: actor.id, memo: `Ship #${o.number} ${s.carrier}` },
      });
    await tx.order.update({
      where: { id: orderId },
      data: { status: "SHIPPED", shippedAt: new Date(), carrier: s.carrier, trackingNo: s.trackingNo, shippingFeeCents: s.shippingFeeCents },
    });
    await notify(tx, { audience: "STORE", storeId: o.storeId, title: `Order #${o.number} shipped · ${s.carrier} ${s.trackingNo}`, link: `/s/${o.store.slug}/orders/${orderId}` });
    await audit(tx, actor.id, "order.ship", "Order", orderId, s);
  });
}

export function markDelivered(orderId: string, actor: Actor) {
  return db.$transaction(async (tx) => {
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { store: true } });
    if (o.status !== "SHIPPED") throw new UserError("Order is not shipped.");
    await tx.order.update({ where: { id: orderId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    await notify(tx, { audience: "STORE", storeId: o.storeId, title: `Order #${o.number} delivered`, link: `/s/${o.store.slug}/orders/${orderId}` });
    await audit(tx, actor.id, "order.deliver", "Order", orderId);
  });
}

export function recordPayment(storeId: string, actor: Actor, p: { amountCents: number; method: string; reference?: string }) {
  return db.$transaction(async (tx) => {
    await lockStore(tx, storeId);
    const bal = await getBalances(storeId, { tx });
    const a = allocatePayment(p.amountCents, { outstandingCents: bal.OUTSTANDING, shippingCents: bal.SHIPPING });
    const pay = await tx.payment.create({ data: { storeId, amountCents: p.amountCents, method: p.method, reference: p.reference, createdById: actor.id } });
    const base = { storeId, type: "PAYMENT" as const, paymentId: pay.id, createdById: actor.id, memo: `${p.method} ${p.reference ?? ""}`.trim() };
    if (a.outstandingCents) await tx.ledgerEntry.create({ data: { ...base, bucket: "OUTSTANDING", amountCents: -a.outstandingCents } });
    if (a.shippingCents) await tx.ledgerEntry.create({ data: { ...base, bucket: "SHIPPING", amountCents: -a.shippingCents } });
    if (a.creditCents) await tx.ledgerEntry.create({ data: { ...base, bucket: "CREDIT", amountCents: a.creditCents } });
    await settleStatements(tx, storeId);
    await notify(tx, { audience: "STORE", storeId, title: `Payment received ${formatUSD(p.amountCents)}`, body: p.reference });
    const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
    if (store.status === "PENDING" && bal.CREDIT + a.creditCents >= store.requiredBalanceCents) {
      await tx.store.update({ where: { id: storeId }, data: { status: "ACTIVE" } });
      await notify(tx, { audience: "STORE", storeId, title: "Your partner account is active. You can start ordering.", link: `/s/${store.slug}/dashboard` });
      await audit(tx, actor.id, "store.activated", "Store", storeId);
    }
    await audit(tx, actor.id, "payment.record", "Store", storeId, { ...p, allocation: a });
    return a;
  });
}

/** Mark open statements PAID once the account is back to required balance with nothing owed. */
export async function settleStatements(tx: Tx, storeId: string) {
  const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
  const b = await getBalances(storeId, { tx });
  if (b.CREDIT >= store.requiredBalanceCents && b.OUTSTANDING <= 0 && b.SHIPPING <= 0)
    await tx.statement.updateMany({ where: { storeId, status: { in: ["ISSUED", "OVERDUE"] } }, data: { status: "PAID" } });
}

export function adjust(storeId: string, actor: Actor, a: { bucket: "CREDIT" | "OUTSTANDING" | "SHIPPING"; amountCents: number; memo: string; type: "ADJUSTMENT" | "DEPOSIT" }) {
  return db.$transaction(async (tx) => {
    await lockStore(tx, storeId);
    await tx.ledgerEntry.create({ data: { storeId, bucket: a.bucket, type: a.type, amountCents: a.amountCents, memo: a.memo, createdById: actor.id } });
    await settleStatements(tx, storeId);
    await audit(tx, actor.id, `ledger.${a.type.toLowerCase()}`, "Store", storeId, a);
  });
}

/**
 * Correct (raise, lower or waive) the shipping fee of an already shipped order, with a reason.
 * Raising bills the difference to the SHIPPING bucket. Lowering removes what is still owed there; any part the
 * partner had already paid goes back to prepaid credit, so no negative "shipping" balance is left behind.
 */
export function setShippingFee(orderId: string, actor: Actor, newFeeCents: number, reason: string) {
  return db.$transaction(async (tx) => {
    if (!Number.isInteger(newFeeCents) || newFeeCents < 0) throw new UserError("Shipping fee cannot be negative.");
    if (reason.trim().length < 3) throw new UserError("A reason is required.");
    const head = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { storeId: true } });
    await lockStore(tx, head.storeId);
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { store: true } });
    if (o.status !== "SHIPPED" && o.status !== "DELIVERED") throw new UserError("The shipping fee is set when the order ships; it can be corrected once shipped.");
    const old = o.shippingFeeCents ?? 0;
    const delta = newFeeCents - old;
    if (delta === 0) throw new UserError("That is already the shipping fee.");
    const memo = `Shipping fee #${o.number} ${formatUSD(old)} -> ${formatUSD(newFeeCents)}: ${reason.trim()}`;
    const base = { storeId: o.storeId, orderId, createdById: actor.id, type: "ADJUSTMENT" as const, memo };
    if (delta > 0) {
      await tx.ledgerEntry.create({ data: { ...base, bucket: "SHIPPING", amountCents: delta } });
    } else {
      const owed = Math.max((await getBalances(o.storeId, { tx })).SHIPPING, 0);
      const fromOwed = Math.min(-delta, owed);
      const toCredit = -delta - fromOwed;
      if (fromOwed) await tx.ledgerEntry.create({ data: { ...base, bucket: "SHIPPING", amountCents: -fromOwed } });
      if (toCredit) await tx.ledgerEntry.create({ data: { ...base, bucket: "CREDIT", amountCents: toCredit } });
    }
    await tx.order.update({ where: { id: orderId }, data: { shippingFeeCents: newFeeCents } });
    await settleStatements(tx, o.storeId);
    await notify(tx, { audience: "STORE", storeId: o.storeId, title: `Shipping fee on order #${o.number} changed to ${formatUSD(newFeeCents)}`, body: reason.trim(), link: `/s/${o.store.slug}/orders/${orderId}` });
    await audit(tx, actor.id, "order.shipping_fee", "Order", orderId, { from: old, to: newFeeCents, reason });
  });
}
