/* eslint-disable @typescript-eslint/no-explicit-any -- dev-only load generator with synthetic rows */
// Load-test data generator. NEVER point this at a real database: it refuses unless the DB name ends in "_scale".
// Usage: DATABASE_URL=postgresql://.../regenx_scale ORDERS=10000 pnpm tsx scripts/scale-seed.ts
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!/_scale(\?|$)/.test(url)) throw new Error("Refusing to seed: DATABASE_URL must point at a database whose name ends with _scale");

const db = new PrismaClient();
const N_ORDERS = Number(process.env.ORDERS ?? 10000);
const N_STORES = Number(process.env.STORES ?? 40);
const CUST_PER_STORE = Math.ceil((N_ORDERS * 3) / N_STORES);
const DAY = 86400000;

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const chunk = async <T,>(rows: T[], size: number, fn: (b: T[]) => Promise<unknown>) => {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
};
const STATES = ["TX", "CA", "NY", "FL", "WA", "IL", "OH", "GA", "NC", "AZ"];
const t0 = Date.now();
const lap = (m: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${m}`);

async function main() {
  const want = Number(process.env.PRODUCTS ?? 0);
  const base = await db.product.findMany();
  if (want > base.length) {
    const extra = Array.from({ length: want - base.length }, (_, i) => {
      const b = base[i % base.length];
      return { id: randomUUID(), sku: `${b.sku}-X${i}`, name: `${b.name} v${Math.floor(i / base.length) + 2}`, strength: b.strength, basePriceCents: b.basePriceCents };
    });
    await chunk(extra, 2000, (b) => db.product.createMany({ data: b }));
  }
  const products = await db.product.findMany({ select: { id: true, basePriceCents: true } });
  if (!products.length) throw new Error("Run the catalog seed first (prisma db seed with SEED_DEMO=0)");
  const hash = await bcrypt.hash("ChangeMe123!", 4);

  // users
  await db.user.createMany({ data: [
    { id: randomUUID(), email: "admin@scale.local", name: "Admin", role: "ADMIN", passwordHash: hash },
    { id: randomUUID(), email: "gp@scale.local", name: "GP", role: "FULFILLMENT", passwordHash: hash },
  ] });

  // stores (store 0 is deliberately the whale: 20% of all orders)
  const stores = Array.from({ length: N_STORES }, (_, i) => ({
    id: randomUUID(), name: `Store ${String(i + 1).padStart(3, "0")}`, slug: `s${String(i + 1).padStart(3, "0")}`,
    tier: i % 5 === 0 ? ("PREMIUM" as const) : ("STARTER" as const), requiredBalanceCents: i % 5 === 0 ? 5_000_000 : 1_000_000,
    discountBps: i % 5 === 0 ? 1000 : 500, status: "ACTIVE" as const, allowedRegions: ["US"], nextOrderNumber: 1001,
  }));
  await db.store.createMany({ data: stores });
  await db.user.createMany({ data: stores.map((s, i) => ({ id: randomUUID(), email: `owner${i + 1}@scale.local`, name: `Owner ${i + 1}`, role: "PARTNER_OWNER" as const, storeId: s.id, passwordHash: hash })) });
  lap(`stores ${N_STORES} + users`);

  // customers
  const customers: { id: string; storeId: string; name: string; email: string; phone: string; line1: string; city: string; region: string; postalCode: string; createdAt: Date }[] = [];
  stores.forEach((s, si) => {
    const n = si === 0 ? Math.ceil(CUST_PER_STORE * 4) : CUST_PER_STORE;
    for (let i = 0; i < n; i++)
      customers.push({ id: randomUUID(), storeId: s.id, name: `Customer ${si}-${i}`, email: `c${si}_${i}@example.com`, phone: `555${String(1000000 + i).slice(-7)}`, line1: `${i} Main St`, city: "Austin", region: pick(STATES), postalCode: "73301", createdAt: new Date(Date.now() - Math.floor(rnd() * 180) * DAY) });
  });
  await chunk(customers, 5000, (b) => db.customer.createMany({ data: b }));
  lap(`customers ${customers.length}`);
  const custByStore = new Map<string, typeof customers>();
  for (const c of customers) custByStore.set(c.storeId, [...(custByStore.get(c.storeId) ?? []), c]);

  // orders + items + ledger
  const STATUS = [["DELIVERED", 50], ["SHIPPED", 15], ["APPROVED", 10], ["PACKING", 5], ["ON_HOLD", 3], ["CANCELLED", 5], ["DRAFT", 12]] as const;
  const pickStatus = () => { let r = rnd() * 100; for (const [s, w] of STATUS) if ((r -= w) < 0) return s; return "DELIVERED" as const; };
  const orders: any[] = [], items: any[] = [], ledger: any[] = [], stock: any[] = [];
  const counter = new Map<string, number>();
  for (const s of stores) ledger.push({ id: randomUUID(), storeId: s.id, bucket: "CREDIT", type: "DEPOSIT", amountCents: s.requiredBalanceCents, createdAt: new Date(Date.now() - 200 * DAY) });
  for (let n = 0; n < N_ORDERS; n++) {
    const s = rnd() < 0.2 ? stores[0] : pick(stores);
    const c = pick(custByStore.get(s.id)!);
    const status = pickStatus();
    const createdAt = new Date(Date.now() - Math.floor(rnd() * 180 * DAY));
    const num = (counter.get(s.id) ?? 1000) + 1;
    counter.set(s.id, num);
    const id = randomUUID();
    let subtotal = 0;
    for (let k = 0, lines = 1 + Math.floor(rnd() * 5); k < lines; k++) {
      const p = pick(products), qty = 1 + Math.floor(rnd() * 8);
      subtotal += qty * p.basePriceCents;
      items.push({ id: randomUUID(), orderId: id, productId: p.id, qty, unitPriceCents: p.basePriceCents });
      if (status === "APPROVED" || status === "PACKING") stock.push({ id: randomUUID(), productId: p.id, type: "RESERVE", reservedDelta: qty, orderId: id, createdAt });
    }
    const total = Math.round((subtotal * (10000 - s.discountBps)) / 10000);
    const live = status !== "DRAFT";
    orders.push({
      id, storeId: s.id, number: num, customerId: c.id, status, shipName: c.name, shipLine1: c.line1, shipCity: c.city, shipRegion: c.region, shipPostalCode: c.postalCode, shipCountry: "US",
      subtotalCents: live ? subtotal : 0, discountBps: live ? s.discountBps : 0, totalCents: live ? total : 0, creditAppliedCents: live && status !== "ON_HOLD" ? total : 0, overageCents: status === "ON_HOLD" ? total : 0,
      createdAt, submittedAt: live ? createdAt : null, approvedAt: live && status !== "ON_HOLD" && status !== "CANCELLED" ? createdAt : null,
      shippedAt: status === "SHIPPED" || status === "DELIVERED" ? new Date(createdAt.getTime() + 2 * DAY) : null, trackingNo: status === "SHIPPED" || status === "DELIVERED" ? `1Z${num}` : null, carrier: status === "SHIPPED" || status === "DELIVERED" ? "UPS" : null,
    });
    if (live && status !== "ON_HOLD") ledger.push({ id: randomUUID(), storeId: s.id, bucket: "CREDIT", type: "ORDER_DEBIT", amountCents: -total, orderId: id, createdAt });
    if (status === "ON_HOLD") ledger.push({ id: randomUUID(), storeId: s.id, bucket: "OUTSTANDING", type: "OVERAGE", amountCents: total, orderId: id, createdAt });
    if (status === "SHIPPED" || status === "DELIVERED") ledger.push({ id: randomUUID(), storeId: s.id, bucket: "SHIPPING", type: "SHIPPING_CHARGE", amountCents: 1200, orderId: id, createdAt });
    if (status === "DELIVERED" && rnd() < 0.3) ledger.push({ id: randomUUID(), storeId: s.id, bucket: "CREDIT", type: "PAYMENT", amountCents: total, createdAt });
  }
  for (const s of stores) await db.store.update({ where: { id: s.id }, data: { nextOrderNumber: (counter.get(s.id) ?? 1000) + 1 } });
  await chunk(orders, 2000, (b) => db.order.createMany({ data: b }));
  lap(`orders ${orders.length}`);
  await chunk(items, 5000, (b) => db.orderItem.createMany({ data: b }));
  lap(`order items ${items.length}`);
  await chunk(ledger, 5000, (b) => db.ledgerEntry.createMany({ data: b }));
  lap(`ledger ${ledger.length}`);

  // stock: 100 tracked products with receipts + ships
  const tracked = products.slice(0, 100);
  await db.product.updateMany({ where: { id: { in: tracked.map((p) => p.id) } }, data: { trackStock: true, reorderLevel: 20 } });
  for (const p of tracked) { stock.push({ id: randomUUID(), productId: p.id, type: "RECEIPT", onHandDelta: 5000, memo: "scale seed", createdAt: new Date(Date.now() - 190 * DAY) }); }
  await chunk(stock, 5000, (b) => db.stockMovement.createMany({ data: b }));
  lap(`stock movements ${stock.length}`);

  // chat + notifications + statements
  const users = await db.user.findMany({ select: { id: true, storeId: true, role: true } });
  const owners = users.filter((u) => u.storeId);
  const admin = users.find((u) => u.role === "ADMIN")!;
  const msgs = Array.from({ length: N_ORDERS * 2 }, () => { const o = pick(owners); return { id: randomUUID(), storeId: o.storeId!, authorId: rnd() < 0.5 ? o.id : admin.id, body: "hello this is a chat message for load testing", createdAt: new Date(Date.now() - Math.floor(rnd() * 90 * DAY)) }; });
  await chunk(msgs, 5000, (b) => db.message.createMany({ data: b }));
  const notes = Array.from({ length: N_ORDERS * 5 }, () => ({ id: randomUUID(), audience: pick(["ADMIN", "FULFILLMENT", "STORE"] as const), storeId: pick(stores).id, title: "New order Store #1001", createdAt: new Date(Date.now() - Math.floor(rnd() * 90 * DAY)) }));
  await chunk(notes, 5000, (b) => db.notification.createMany({ data: b }));
  const stmts = stores.flatMap((s) => Array.from({ length: 26 }, (_, w) => ({ id: randomUUID(), storeId: s.id, periodStart: new Date(Date.now() - (w + 1) * 7 * DAY), periodEnd: new Date(Date.now() - w * 7 * DAY), openingCreditCents: 1, debitsCents: 1, closingCreditCents: 1, replenishDueCents: 0, outstandingDueCents: 0, shippingDueCents: 0, dueAt: new Date(Date.now() - w * 7 * DAY), status: "PAID" as const })));
  await chunk(stmts, 5000, (b) => db.statement.createMany({ data: b }));
  lap(`messages ${msgs.length}, notifications ${notes.length}, statements ${stmts.length}`);
  console.log(`DONE in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
main().finally(() => db.$disconnect());
