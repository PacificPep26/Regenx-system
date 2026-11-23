import { describe, it, expect, beforeAll, afterAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("sales reports (db)", async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import("@/lib/db");
  const { salesByPeriod, topProducts } = await import("@/lib/reports");
  let storeA = "", storeB = "", product = "";

  async function order(storeId: string, number: number, status: "APPROVED" | "DELIVERED" | "CANCELLED" | "DRAFT", submittedAt: Date, total: number, qty: number, ship = 0) {
    const c = await db.customer.upsert({
      where: { storeId_email: { storeId, email: "c@x.com" } },
      create: { storeId, name: "C", email: "c@x.com", phone: "5551234", line1: "1", city: "A", region: "TX", postalCode: "1" },
      update: {},
    });
    await db.order.create({
      data: {
        storeId, number, customerId: c.id, status, shipName: "C", shipLine1: "1", shipCity: "A", shipRegion: "TX", shipPostalCode: "1", shipCountry: "US",
        totalCents: total, submittedAt, shippingFeeCents: ship || null, items: { create: [{ productId: product, qty, unitPriceCents: 100 }] },
      },
    });
  }

  beforeAll(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "StockMovement","Notification","AuditLog","Message","ChatRead","SavedView","StoreSeen","Statement","LedgerEntry","Payment","OrderItem","Order","Customer","User","Store","Product" CASCADE`);
    product = (await db.product.create({ data: { sku: "R-1", name: "Rep", strength: "5mg", basePriceCents: 100 } })).id;
    const mk = (slug: string) => db.store.create({ data: { name: slug, slug, tier: "STARTER", requiredBalanceCents: 1, discountBps: 0, status: "ACTIVE", allowedRegions: ["US"] } }).then((s) => s.id);
    storeA = await mk("ra");
    storeB = await mk("rb");
    // 2026-03-10 03:30Z is 23:30 on Mar 9 in New York (EDT), 05:00Z is 01:00 on Mar 10
    await order(storeA, 1, "APPROVED", new Date("2026-03-10T03:30:00Z"), 1000, 2, 150);
    await order(storeA, 2, "DELIVERED", new Date("2026-03-10T05:00:00Z"), 2000, 3);
    await order(storeA, 3, "DELIVERED", new Date("2026-04-02T15:00:00Z"), 500, 1);
    await order(storeA, 4, "CANCELLED", new Date("2026-03-10T15:00:00Z"), 9999, 9); // excluded
    await order(storeA, 5, "DRAFT", new Date("2026-03-10T15:00:00Z"), 9999, 9); // excluded
    await order(storeB, 1, "APPROVED", new Date("2026-03-10T15:00:00Z"), 700, 4);
  });
  afterAll(() => db.$disconnect());

  const from = new Date("2026-03-01T00:00:00Z"), to = new Date("2026-05-01T00:00:00Z");

  it("groups by New York day, excludes cancelled and drafts, sums units/wholesale/shipping", async () => {
    const rows = await salesByPeriod("day", from, to, { storeId: storeA });
    const byDay = Object.fromEntries(rows.map((r) => [r.period.toISOString().slice(0, 10), r]));
    expect(Object.keys(byDay).sort()).toEqual(["2026-03-09", "2026-03-10", "2026-04-02"]);
    expect(byDay["2026-03-09"]).toMatchObject({ orders: 1, units: 2, wholesale: 1000, shipping: 150 });
    expect(byDay["2026-03-10"]).toMatchObject({ orders: 1, units: 3, wholesale: 2000, shipping: 0 });
  });

  it("monthly view rolls days into months", async () => {
    const rows = await salesByPeriod("month", from, to, { storeId: storeA });
    expect(rows.map((r) => [r.period.toISOString().slice(0, 7), r.orders, r.wholesale])).toEqual([["2026-04", 1, 500], ["2026-03", 2, 3000]]);
  });

  it("scope: a store never sees another store's numbers; all-stores and name filter work", async () => {
    const all = await salesByPeriod("month", from, to, {});
    expect(all.find((r) => r.period.toISOString().startsWith("2026-03"))?.wholesale).toBe(3700);
    const onlyB = await salesByPeriod("month", from, to, { storeQ: "rb" });
    expect(onlyB).toHaveLength(1);
    expect(onlyB[0]).toMatchObject({ orders: 1, wholesale: 700 });
    const top = await topProducts(from, to, { storeId: storeB });
    expect(top[0]).toMatchObject({ sku: "R-1", units: 4, orders: 1 });
  });
});
