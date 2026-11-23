// Integration: runs the real transactional order/money code against TEST_DATABASE_URL.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("order + ledger flow (db)", async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import("@/lib/db");
  const { submitOrder, cancelOrder, markShipped, recordPayment, approveHold } = await import("@/lib/orders");
  const { getBalances } = await import("@/lib/balances");
  const { runWeeklyStatements } = await import("@/lib/statements");

  const actor = { id: "test-admin", role: "ADMIN" };
  let storeId = "";
  let customerId = "";
  let p10 = ""; // $100.00 product
  let pRestricted = "";

  async function draft(qty: number, productId = p10, region = "TX") {
    const s = await db.store.update({ where: { id: storeId }, data: { nextOrderNumber: { increment: 1 } } });
    const o = await db.order.create({
      data: {
        storeId, number: s.nextOrderNumber - 1, customerId,
        shipName: "T", shipLine1: "1 St", shipCity: "Austin", shipRegion: region, shipPostalCode: "78701", shipCountry: "US",
        items: { create: [{ productId, qty, unitPriceCents: 0 }] },
      },
    });
    return o.id;
  }

  beforeAll(async () => {
    await db.$executeRawUnsafe(
      `TRUNCATE "Notification","AuditLog","Message","ChatRead","SavedView","Statement","LedgerEntry","Payment","OrderItem","Order","Customer","User","Store","Product" CASCADE`,
    );
    p10 = (await db.product.create({ data: { sku: "T-100", name: "Test", strength: "1mg", basePriceCents: 10_000 } })).id;
    pRestricted = (await db.product.create({ data: { sku: "T-R", name: "Rx", strength: "1mg", basePriceCents: 1_000, restricted: true } })).id;
    const s = await db.store.create({
      data: { name: "Flow", slug: "flow", tier: "STARTER", requiredBalanceCents: 1_000_000, discountBps: 500, status: "ACTIVE", allowedRegions: ["US-TX"] },
    });
    storeId = s.id;
    await db.ledgerEntry.create({ data: { storeId, bucket: "CREDIT", type: "DEPOSIT", amountCents: 1_000_000 } });
    customerId = (await db.customer.create({ data: { storeId, name: "T", email: "t@x.com", line1: "1", city: "A", region: "TX", postalCode: "1" } })).id;
  });
  afterAll(() => db.$disconnect());

  it("debits credit with 5% discount when covered", async () => {
    const id = await draft(10); // $1,000 -> $950
    expect(await submitOrder(id, actor)).toBe("APPROVED");
    expect((await getBalances(storeId)).CREDIT).toBe(1_000_000 - 95_000);
  });

  it("blocks unauthorized destination and restricted SKU", async () => {
    await expect(submitOrder(await draft(1, p10, "CA"), actor)).rejects.toThrow(/not authorized/);
    await expect(submitOrder(await draft(1, pRestricted), actor)).rejects.toThrow(/restricted/);
  });

  it("concurrent submits never overspend credit; excess goes to outstanding + ON_HOLD", async () => {
    // drain to exactly $100 credit
    const b = await getBalances(storeId);
    await db.ledgerEntry.create({ data: { storeId, bucket: "CREDIT", type: "ADJUSTMENT", amountCents: 10_000 - b.CREDIT } });
    const a = await draft(1); // $95
    const c = await draft(1); // $95
    const res = await Promise.all([submitOrder(a, actor), submitOrder(c, actor)]);
    expect(res.sort()).toEqual(["APPROVED", "ON_HOLD"]);
    const after = await getBalances(storeId);
    expect(after.CREDIT).toBe(10_000 - 9_500 - 500); // second order took the last $5
    expect(after.OUTSTANDING).toBe(9_000);
    const held = await db.order.findFirstOrThrow({ where: { status: "ON_HOLD" } });
    await approveHold(held.id, actor);
    expect((await db.order.findUniqueOrThrow({ where: { id: held.id } })).status).toBe("APPROVED");
  });

  it("cancel refunds exactly what was charged", async () => {
    const before = await getBalances(storeId);
    const held = await db.order.findFirstOrThrow({ where: { overageCents: { gt: 0 } } });
    await cancelOrder(held.id, actor, "test");
    const after = await getBalances(storeId);
    expect(after.CREDIT - before.CREDIT).toBe(held.creditAppliedCents);
    expect(before.OUTSTANDING - after.OUTSTANDING).toBe(held.overageCents);
  });

  it("shipping is billed separately and does not reduce credit", async () => {
    const o = await db.order.findFirstOrThrow({ where: { status: "APPROVED" } });
    const before = await getBalances(storeId);
    await markShipped(o.id, actor, { carrier: "UPS", trackingNo: "1Z999", shippingFeeCents: 1_250 });
    const after = await getBalances(storeId);
    expect(after.CREDIT).toBe(before.CREDIT);
    expect(after.SHIPPING - before.SHIPPING).toBe(1_250);
  });

  it("popular products counts submitted orders only (no drafts, no cancelled)", async () => {
    const { popularProducts } = await import("@/lib/pickers");
    const expected = await db.order.count({ where: { storeId, status: { notIn: ["DRAFT", "CANCELLED"] }, items: { some: { productId: p10 } } } });
    expect(expected).toBeGreaterThan(0);
    const popular = await popularProducts(storeId);
    expect(popular[p10]).toBe(expected);
    expect(popular[pRestricted]).toBeUndefined(); // only ever in rejected submits
  });

  it("weekly statement + payment settles it", async () => {
    // move all entries into last week so the statement period covers them
    const { statementPeriod } = await import("@/lib/ledger");
    const { periodStart } = statementPeriod(new Date());
    await db.ledgerEntry.updateMany({ where: { storeId }, data: { createdAt: new Date(periodStart.getTime() + 3600_000) } });
    const r = await runWeeklyStatements();
    expect(r.created).toBe(1);
    const st = await db.statement.findFirstOrThrow({ where: { storeId } });
    const b = await getBalances(storeId);
    expect(st.replenishDueCents).toBe(1_000_000 - b.CREDIT);
    expect(st.shippingDueCents).toBe(b.SHIPPING);
    expect(st.status).toBe("ISSUED");
    expect((await runWeeklyStatements()).created).toBe(0); // idempotent

    await recordPayment(storeId, actor, { amountCents: st.replenishDueCents + st.outstandingDueCents + st.shippingDueCents, method: "WIRE" });
    const paid = await getBalances(storeId);
    expect(paid).toEqual({ CREDIT: 1_000_000, OUTSTANDING: 0, SHIPPING: 0 });
    expect((await db.statement.findUniqueOrThrow({ where: { id: st.id } })).status).toBe("PAID");
  });

  it("overdue statement only blocks fulfillment beyond credit; orders within credit still go through", async () => {
    await db.statement.updateMany({ where: { storeId }, data: { status: "OVERDUE" } });
    const bal = await getBalances(storeId);
    expect(bal.CREDIT).toBeGreaterThan(10_000);
    expect(await submitOrder(await draft(1), actor)).toBe("APPROVED"); // within credit
    // drain credit so the next order would exceed it
    await db.ledgerEntry.create({ data: { storeId, bucket: "CREDIT", type: "ADJUSTMENT", amountCents: 5_000 - (await getBalances(storeId)).CREDIT } });
    await expect(submitOrder(await draft(1), actor)).rejects.toThrow(/overdue/); // needs $95 > $50 credit
    expect((await getBalances(storeId)).OUTSTANDING).toBe(0); // nothing was recorded
  });
});
