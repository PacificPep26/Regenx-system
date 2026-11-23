import { describe, it, expect, beforeAll, afterAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("stock control (db)", async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import("@/lib/db");
  const { submitOrder, cancelOrder, markShipped } = await import("@/lib/orders");
  const { receiveStock, adjustStock, stockLevels, stockStatus } = await import("@/lib/stock");
  const actor = { id: "gp-user", role: "FULFILLMENT" };
  const admin = { id: "admin-user", role: "ADMIN" };
  let storeId = "", customerId = "", tracked = "", untracked = "";

  async function draft(productId: string, qty: number) {
    const s = await db.store.update({ where: { id: storeId }, data: { nextOrderNumber: { increment: 1 } } });
    return (await db.order.create({
      data: {
        storeId, number: s.nextOrderNumber - 1, customerId, shipName: "T", shipLine1: "1 St", shipCity: "A", shipRegion: "TX", shipPostalCode: "1", shipCountry: "US",
        items: { create: [{ productId, qty, unitPriceCents: 0 }] },
      },
    })).id;
  }
  const lvl = async (id: string) => (await stockLevels([id])).get(id) ?? { onHand: 0, reserved: 0, available: 0 };
  const ship = (id: string) => markShipped(id, actor, { carrier: "UPS", trackingNo: "1Z999", shippingFeeCents: 0 });

  beforeAll(async () => {
    await db.$executeRawUnsafe(
      `TRUNCATE "StockMovement","Notification","AuditLog","Message","ChatRead","SavedView","StoreSeen","Statement","LedgerEntry","Payment","OrderItem","Order","Customer","User","Store","Product" CASCADE`,
    );
    tracked = (await db.product.create({ data: { sku: "S-1", name: "Tracked", strength: "5mg", basePriceCents: 1000, reorderLevel: 2 } })).id;
    untracked = (await db.product.create({ data: { sku: "S-2", name: "Free", strength: "5mg", basePriceCents: 1000 } })).id;
    storeId = (await db.store.create({ data: { name: "S", slug: "s", tier: "STARTER", requiredBalanceCents: 1_000_000, discountBps: 500, status: "ACTIVE", allowedRegions: ["US"] } })).id;
    await db.ledgerEntry.create({ data: { storeId, bucket: "CREDIT", type: "DEPOSIT", amountCents: 1_000_000 } });
    customerId = (await db.customer.create({ data: { storeId, name: "T", email: "t@x.com", phone: "5551234", line1: "1", city: "A", region: "TX", postalCode: "1" } })).id;
  });
  afterAll(() => db.$disconnect());

  it("receiving stock tracks the product and raises on hand", async () => {
    await receiveStock(tracked, 5, "PO-1", actor.id);
    expect(await lvl(tracked)).toEqual({ onHand: 5, reserved: 0, available: 5 });
    expect((await db.product.findUniqueOrThrow({ where: { id: tracked } })).trackStock).toBe(true);
    await expect(receiveStock(tracked, 0, undefined, actor.id)).rejects.toThrow(/positive/);
  });

  let a = "", b = "";
  it("approved orders reserve units; overselling is allowed but visible as a shortage", async () => {
    a = await draft(tracked, 3);
    b = await draft(tracked, 4);
    expect(await submitOrder(a, admin)).toBe("APPROVED");
    expect(await lvl(tracked)).toEqual({ onHand: 5, reserved: 3, available: 2 });
    expect(await submitOrder(b, admin)).toBe("APPROVED");
    expect(await lvl(tracked)).toEqual({ onHand: 5, reserved: 7, available: -2 });
    expect(stockStatus(true, await lvl(tracked), 2)).toBe("out");
  });

  it("shipping consumes on hand + reservation; refuses when physical stock is short", async () => {
    await ship(a);
    expect(await lvl(tracked)).toEqual({ onHand: 2, reserved: 4, available: -2 });
    await expect(ship(b)).rejects.toThrow(/Not enough stock.*need 4, on hand 2/);
    expect((await db.order.findUniqueOrThrow({ where: { id: b } })).status).toBe("APPROVED"); // rolled back
    expect(await lvl(tracked)).toEqual({ onHand: 2, reserved: 4, available: -2 });
    await receiveStock(tracked, 5, "PO-2", actor.id);
    await ship(b);
    expect(await lvl(tracked)).toEqual({ onHand: 3, reserved: 0, available: 3 });
  });

  it("low-stock alert is raised to GP and admin", async () => {
    const n = await db.notification.findMany({ where: { title: { contains: "stock" } } });
    expect(n.some((x) => x.audience === "FULFILLMENT")).toBe(true);
    expect(n.some((x) => x.audience === "ADMIN")).toBe(true);
  });

  it("cancelling an approved order releases its reservation", async () => {
    const c = await draft(tracked, 2);
    await submitOrder(c, admin);
    expect((await lvl(tracked)).reserved).toBe(2);
    await cancelOrder(c, admin, "test");
    expect(await lvl(tracked)).toEqual({ onHand: 3, reserved: 0, available: 3 });
  });

  it("untracked products ship without any stock", async () => {
    const d = await draft(untracked, 9);
    await submitOrder(d, admin);
    await expect(ship(d)).resolves.toBeUndefined();
  });

  it("adjustments need a reason and cannot push on hand below zero", async () => {
    await expect(adjustStock(tracked, -1, "x", actor.id)).rejects.toThrow(/reason/);
    await expect(adjustStock(tracked, -99, "recount", actor.id)).rejects.toThrow(/cannot remove/);
    await adjustStock(tracked, -1, "damaged vial", actor.id);
    expect((await lvl(tracked)).onHand).toBe(2);
  });

  it("cached counters (Store balances, Product stock) always equal the journals", async () => {
    const ledger = await db.ledgerEntry.groupBy({ by: ["storeId", "bucket"], _sum: { amountCents: true } });
    const stores = await db.store.findMany();
    for (const st of stores) {
      const sum = (b: string) => ledger.find((l) => l.storeId === st.id && l.bucket === b)?._sum.amountCents ?? 0;
      expect({ c: st.creditCents, o: st.outstandingCents, s: st.shippingCents }).toEqual({ c: sum("CREDIT"), o: sum("OUTSTANDING"), s: sum("SHIPPING") });
    }
    const moves = await db.stockMovement.groupBy({ by: ["productId"], _sum: { onHandDelta: true, reservedDelta: true } });
    for (const p of await db.product.findMany()) {
      const m = moves.find((x) => x.productId === p.id);
      expect({ h: p.onHand, r: p.reserved }).toEqual({ h: m?._sum.onHandDelta ?? 0, r: m?._sum.reservedDelta ?? 0 });
    }
  });
});
