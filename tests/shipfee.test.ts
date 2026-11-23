import { describe, it, expect, beforeAll, afterAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("correcting a shipping fee (db)", async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import("@/lib/db");
  const { submitOrder, markShipped, recordPayment, setShippingFee } = await import("@/lib/orders");
  const gp = { id: "gp-user", role: "FULFILLMENT" };
  const admin = { id: "admin-user", role: "ADMIN" };
  let storeId = "", customerId = "", product = "";

  async function shipped(fee: number) {
    const s = await db.store.update({ where: { id: storeId }, data: { nextOrderNumber: { increment: 1 } } });
    const o = await db.order.create({
      data: { storeId, number: s.nextOrderNumber - 1, customerId, shipName: "T", shipLine1: "1", shipCity: "A", shipRegion: "TX", shipPostalCode: "1", shipCountry: "US", items: { create: [{ productId: product, qty: 1, unitPriceCents: 0 }] } },
    });
    await submitOrder(o.id, admin);
    await markShipped(o.id, gp, { carrier: "UPS", trackingNo: "1Z999", shippingFeeCents: fee });
    return o.id;
  }
  const bal = async () => {
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    return { credit: s.creditCents, ship: s.shippingCents };
  };

  beforeAll(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "StockMovement","Notification","AuditLog","Statement","LedgerEntry","Payment","OrderItem","Order","Customer","User","Store","Product" CASCADE`);
    product = (await db.product.create({ data: { sku: "F-1", name: "Fee", strength: "5mg", basePriceCents: 10_000 } })).id;
    storeId = (await db.store.create({ data: { name: "F", slug: "f", tier: "STARTER", requiredBalanceCents: 1_000_000, discountBps: 0, status: "ACTIVE", allowedRegions: ["US"] } })).id;
    await db.ledgerEntry.create({ data: { storeId, bucket: "CREDIT", type: "DEPOSIT", amountCents: 1_000_000 } });
    customerId = (await db.customer.create({ data: { storeId, name: "T", email: "t@x.com", phone: "5551234", line1: "1", city: "A", region: "TX", postalCode: "1" } })).id;
  });
  afterAll(() => db.$disconnect());

  it("raising the fee bills the difference", async () => {
    const id = await shipped(1_000);
    expect((await bal()).ship).toBe(1_000);
    await setShippingFee(id, gp, 1_800, "carrier re-weigh");
    expect((await bal()).ship).toBe(1_800);
    expect((await db.order.findUniqueOrThrow({ where: { id } })).shippingFeeCents).toBe(1_800);
  });

  it("lowering or waiving removes what is still owed", async () => {
    const before = await bal();
    const id = await shipped(2_000);
    await setShippingFee(id, admin, 0, "free shipping promo");
    const after = await bal();
    expect(after.ship).toBe(before.ship); // the waived fee does not stay on the account
    expect(after.credit).toBe(before.credit - 10_000); // only the goods were charged
  });

  it("if the partner already paid the shipping, the reduction goes back to prepaid credit", async () => {
    const id = await shipped(3_000);
    const owed = (await bal()).ship;
    await recordPayment(storeId, admin, { amountCents: owed, method: "WIRE" }); // pays all shipping owed
    const paid = await bal();
    expect(paid.ship).toBe(0);
    await setShippingFee(id, admin, 1_000, "overcharged");
    const after = await bal();
    expect(after.ship).toBe(0); // no negative shipping balance
    expect(after.credit).toBe(paid.credit + 2_000); // refunded to credit
  });

  it("needs a reason, a real change, and a shipped order", async () => {
    const id = await shipped(500);
    await expect(setShippingFee(id, gp, 600, "x")).rejects.toThrow(/reason/);
    await expect(setShippingFee(id, gp, 500, "same value")).rejects.toThrow(/already/);
    await expect(setShippingFee(id, gp, -1, "negative")).rejects.toThrow(/negative/);
    const s = await db.store.update({ where: { id: storeId }, data: { nextOrderNumber: { increment: 1 } } });
    const open = await db.order.create({ data: { storeId, number: s.nextOrderNumber - 1, customerId, shipName: "T", shipLine1: "1", shipCity: "A", shipRegion: "TX", shipPostalCode: "1", shipCountry: "US", items: { create: [{ productId: product, qty: 1, unitPriceCents: 0 }] } } });
    await expect(setShippingFee(open.id, gp, 100, "too early")).rejects.toThrow(/once shipped/);
  });

  it("cached store balances still equal the ledger after all of this", async () => {
    const ledger = await db.ledgerEntry.groupBy({ by: ["bucket"], where: { storeId }, _sum: { amountCents: true } });
    const sum = (b: string) => ledger.find((l) => l.bucket === b)?._sum.amountCents ?? 0;
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    expect({ c: s.creditCents, o: s.outstandingCents, sh: s.shippingCents }).toEqual({ c: sum("CREDIT"), o: sum("OUTSTANDING"), sh: sum("SHIPPING") });
  });
});
