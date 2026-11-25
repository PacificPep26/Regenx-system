import { describe, it, expect, beforeAll, afterAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("GP earnings and payout requests (db)", async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import("@/lib/db");
  const { earningsByDay, payoutSummary, requestPayout, resolvePayout } = await import("@/lib/gpEarnings");
  const gp = { id: "gp-user", role: "FULFILLMENT" };
  const admin = { id: "admin-user", role: "ADMIN" };
  let storeId = "", customerId = "", product = "", n = 0;

  async function shipped(qty: number, shippedAt: Date, status: "SHIPPED" | "DELIVERED" | "APPROVED" = "SHIPPED") {
    n += 1;
    await db.order.create({
      data: { storeId, number: n, customerId, status, shippedAt, shipName: "T", shipLine1: "1", shipCity: "A", shipRegion: "TX", shipPostalCode: "1", shipCountry: "US", items: { create: [{ productId: product, qty, unitPriceCents: 0 }] } },
    });
  }

  beforeAll(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "GpPayout","StockMovement","Notification","AuditLog","LedgerEntry","OrderItem","Order","Customer","User","Store","Product" CASCADE`);
    product = (await db.product.create({ data: { sku: "G-1", name: "G", strength: "5mg", basePriceCents: 10_000 } })).id;
    storeId = (await db.store.create({ data: { name: "G", slug: "g", tier: "STARTER", requiredBalanceCents: 1_000_000, discountBps: 0, status: "ACTIVE", allowedRegions: ["US"] } })).id;
    customerId = (await db.customer.create({ data: { storeId, name: "T", email: "t@x.com", phone: "5551234", line1: "1", city: "A", region: "TX", postalCode: "1" } })).id;
    // 2 units late on Mon Nov 2 (NY) and 3 units on Tue Nov 3 (NY): UTC would put the first one on Nov 3
    await shipped(2, new Date("2026-11-03T03:30:00Z"));
    await shipped(3, new Date("2026-11-03T15:00:00Z"), "DELIVERED");
    await shipped(9, new Date("2026-11-03T15:00:00Z"), "APPROVED"); // not shipped: earns nothing
  });
  afterAll(() => db.$disconnect());

  it("groups shipped units by New York day, $10 each, ignoring unshipped orders", async () => {
    const rows = await earningsByDay(new Date("2026-11-01T00:00:00Z"), new Date("2026-11-10T00:00:00Z"));
    expect(rows).toEqual([
      { day: "2026-11-03", orders: 1, units: 3, cents: 3_000 },
      { day: "2026-11-02", orders: 1, units: 2, cents: 2_000 },
    ]);
  });

  it("only GP can request, only up to what is available, one open request at a time", async () => {
    expect((await payoutSummary()).available).toBe(5_000);
    await expect(requestPayout(admin, 1_000)).rejects.toThrow(/packing partner/);
    await expect(requestPayout(gp, 5_001)).rejects.toThrow(/up to/);
    await expect(requestPayout(gp, 0)).rejects.toThrow(/above zero/);
    await requestPayout(gp, 3_000);
    await expect(requestPayout(gp, 1_000)).rejects.toThrow(/already/);
    expect(await payoutSummary()).toMatchObject({ earned: 5_000, pending: 3_000, available: 2_000 });
    expect(await db.notification.count({ where: { audience: "ADMIN", title: { contains: "payout" } } })).toBe(1);
  });

  it("paying keeps the amount spent; rejecting gives it back; only admin resolves, once", async () => {
    const first = await db.gpPayout.findFirstOrThrow({ where: { status: "REQUESTED" } });
    await expect(resolvePayout(first.id, gp, { status: "PAID" })).rejects.toThrow(/admin/);
    await expect(resolvePayout(first.id, admin, { status: "REJECTED" })).rejects.toThrow(/reason/);
    await resolvePayout(first.id, admin, { status: "REJECTED", note: "wait for Friday" });
    expect((await payoutSummary()).available).toBe(5_000);

    await requestPayout(gp, 5_000);
    const second = await db.gpPayout.findFirstOrThrow({ where: { status: "REQUESTED" } });
    await resolvePayout(second.id, admin, { status: "PAID", method: "WIRE", reference: "W-1" });
    expect(await payoutSummary()).toMatchObject({ paid: 5_000, pending: 0, available: 0 });
    await expect(resolvePayout(second.id, admin, { status: "PAID" })).rejects.toThrow(/already/);
  });

  it("a request for a period cannot exceed what was earned in those days", async () => {
    await shipped(4, new Date("2026-11-04T15:00:00Z")); // +$40 on Nov 4, nothing paid or pending yet for it
    await expect(requestPayout(gp, 3_000, { from: "2026-11-02", to: "2026-11-02" })).rejects.toThrow(/earned \$20\.00/); // within what is available, but more than that day earned
    await expect(requestPayout(gp, 1_000, { from: "2026-11-05", to: "2026-11-01" })).rejects.toThrow(/valid period/);
    await requestPayout(gp, 4_000, { from: "2026-11-04", to: "2026-11-04" });
    expect(await db.gpPayout.findFirstOrThrow({ where: { status: "REQUESTED" } })).toMatchObject({ periodFrom: "2026-11-04", periodTo: "2026-11-04", amountCents: 4_000 });
  });
});
