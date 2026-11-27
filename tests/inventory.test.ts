import { describe, it, expect, beforeAll, afterAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

// Program model: Inventory orders only keep stock at GP (nothing charged); each customer order is charged
// (cost of goods) when it is processed and takes its units from the store's own stock.
run("store inventory, customer orders and top-ups (db)", async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import("@/lib/db");
  const { submitOrder, approveHold, cancelOrder, markShipped } = await import("@/lib/orders");
  const inv = await import("@/lib/inventory");
  const { requestTopUp, fulfillTopUp } = await import("@/lib/topups");
  const admin = { id: "admin-user", role: "ADMIN" };
  const gp = { id: "gp-user", role: "FULFILLMENT" };
  const owner = { id: "owner-user", role: "PARTNER_OWNER" };
  let storeId = "", customerId = "", product = "";

  const bal = async () => {
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    return { credit: s.creditCents, outstanding: s.outstandingCents, shipping: s.shippingCents };
  };
  const stock = async () => {
    const s = await db.storeStock.findUnique({ where: { storeId_productId: { storeId, productId: product } } });
    return { onHand: s?.onHand ?? 0, reserved: s?.reserved ?? 0 };
  };
  const stockUp = async (qty: number) => {
    const id = await inv.createInventoryDraft(storeId, admin.id, { items: [{ productId: product, qty }] });
    await inv.submitInventoryOrder(id, owner);
    return id;
  };
  const customerOrder = async (qty: number) => {
    const s = await db.store.update({ where: { id: storeId }, data: { nextOrderNumber: { increment: 1 } } });
    return (await db.order.create({ data: { storeId, number: s.nextOrderNumber - 1, customerId, shipName: "T", shipLine1: "1", shipCity: "A", shipRegion: "TX", shipPostalCode: "1", shipCountry: "US", items: { create: [{ productId: product, qty, unitPriceCents: 0 }] } } })).id;
  };

  beforeAll(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "TopUpRequest","StoreStockMovement","StoreStock","InventoryOrderItem","InventoryOrder","StockMovement","Notification","AuditLog","Statement","LedgerEntry","Payment","OrderItem","Order","Customer","User","Store","Product" CASCADE`);
    product = (await db.product.create({ data: { sku: "I-1", name: "Inv", strength: "5mg", basePriceCents: 10_000 } })).id;
    storeId = (await db.store.create({ data: { name: "I", slug: "i", tier: "STARTER", requiredBalanceCents: 100_000, discountBps: 0, status: "ACTIVE", allowedRegions: ["US"], inventoryMode: true } })).id;
    await db.ledgerEntry.create({ data: { storeId, bucket: "CREDIT", type: "DEPOSIT", amountCents: 100_000 } });
    customerId = (await db.customer.create({ data: { storeId, name: "T", email: "t@x.com", phone: "5551234", line1: "1", city: "A", region: "TX", postalCode: "1" } })).id;
  });
  afterAll(() => db.$disconnect());

  it("a customer order is blocked until the store has inventory, and nothing is charged by the attempt", async () => {
    await expect(submitOrder(await customerOrder(1), admin)).rejects.toThrow(/Not enough in your inventory/);
    expect((await bal()).credit).toBe(100_000);
  });

  it("adding inventory charges nothing and goes straight into the store's stock; needs a received deposit", async () => {
    await db.store.update({ where: { id: storeId }, data: { status: "PENDING" } });
    const draft = await inv.createInventoryDraft(storeId, admin.id, { items: [{ productId: product, qty: 1 }] });
    await expect(inv.submitInventoryOrder(draft, owner)).rejects.toThrow(/deposit/);
    await db.store.update({ where: { id: storeId }, data: { status: "ACTIVE" } });
    await inv.cancelInventoryOrder(draft, owner);

    const id = await stockUp(5);
    expect((await bal()).credit).toBe(100_000); // no charge
    expect(await db.ledgerEntry.count({ where: { storeId, type: { not: "DEPOSIT" } } })).toBe(0);
    expect(await stock()).toEqual({ onHand: 5, reserved: 0 }); // in stock right away, no GP step
    expect((await db.inventoryOrder.findUniqueOrThrow({ where: { id } })).status).toBe("RECEIVED");
    await expect(inv.submitInventoryOrder(id, owner)).rejects.toThrow(/draft/);
    await expect(inv.cancelInventoryOrder(id, owner)).rejects.toThrow(/Cannot cancel/);
  });

  it("a customer order is charged its cost of goods and takes units from the store's stock", async () => {
    const a = await customerOrder(3);
    expect(await submitOrder(a, admin)).toBe("APPROVED");
    expect((await bal()).credit).toBe(70_000);
    expect(await stock()).toEqual({ onHand: 5, reserved: 3 });
    await expect(submitOrder(await customerOrder(3), admin)).rejects.toThrow(/need 3, you have 2/);
    expect((await bal()).credit).toBe(70_000); // the blocked attempt did not charge
  });

  it("shipping takes the units out of stock; cancelling gives back both the units and the money", async () => {
    const shipId = (await db.order.findFirstOrThrow({ where: { storeId, status: "APPROVED" } })).id;
    await markShipped(shipId, gp, { carrier: "UPS", trackingNo: "1Z", shippingFeeCents: 500 });
    expect(await stock()).toEqual({ onHand: 2, reserved: 0 });
    expect((await bal()).shipping).toBe(500);
    const b = await customerOrder(2);
    await submitOrder(b, admin);
    expect(await stock()).toEqual({ onHand: 2, reserved: 2 });
    expect((await bal()).credit).toBe(50_000);
    await cancelOrder(b, admin);
    expect(await stock()).toEqual({ onHand: 2, reserved: 0 });
    expect((await bal()).credit).toBe(70_000);
  });

  it("above your credit the order waits ON_HOLD with the overage as outstanding; units are reserved once approved", async () => {
    await db.ledgerEntry.create({ data: { storeId, bucket: "CREDIT", type: "ADJUSTMENT", amountCents: -65_000 } }); // credit 5,000
    const c = await customerOrder(2); // $200 against $50
    expect(await submitOrder(c, admin)).toBe("ON_HOLD");
    expect(await bal()).toMatchObject({ credit: 0, outstanding: 15_000 });
    expect(await stock()).toEqual({ onHand: 2, reserved: 0 });
    await approveHold(c, admin);
    expect(await stock()).toEqual({ onHand: 2, reserved: 2 });
    await expect(submitOrder(await customerOrder(1), admin)).rejects.toThrow(/you have 0/); // even an order that would be held is checked against stock
  });

  it("top-up: only the owner asks, one request at a time, the admin records the payment and closes it", async () => {
    await expect(requestTopUp(storeId, gp, 10_000)).rejects.toThrow(/owner/);
    const id = await requestTopUp(storeId, owner, 20_000, "wire sent");
    await expect(requestTopUp(storeId, owner, 1_000)).rejects.toThrow(/already/);
    expect(await db.notification.count({ where: { audience: "ADMIN", title: { contains: "top-up" } } })).toBe(1);
    const before = await bal();
    await fulfillTopUp(id, admin, { amountCents: 20_000, method: "WIRE", reference: "W9" });
    const after = await bal();
    expect(after.outstanding).toBe(0);
    expect(after.shipping).toBe(0);
    expect(after.credit).toBe(before.credit + 20_000 - before.outstanding - before.shipping); // owed money is paid first
    expect((await db.topUpRequest.findUniqueOrThrow({ where: { id } })).status).toBe("DONE");
    await expect(fulfillTopUp(id, admin, { amountCents: 1, method: "WIRE" })).rejects.toThrow(/closed/);
  });

  it("cached store stock equals its journal and store balances still equal the ledger", async () => {
    const mv = await db.storeStockMovement.aggregate({ where: { storeId }, _sum: { onHandDelta: true, reservedDelta: true } });
    expect(await stock()).toEqual({ onHand: mv._sum.onHandDelta ?? 0, reserved: mv._sum.reservedDelta ?? 0 });
    const ledger = await db.ledgerEntry.groupBy({ by: ["bucket"], where: { storeId }, _sum: { amountCents: true } });
    const sum = (b: string) => ledger.find((l) => l.bucket === b)?._sum.amountCents ?? 0;
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    expect({ c: s.creditCents, o: s.outstandingCents, sh: s.shippingCents }).toEqual({ c: sum("CREDIT"), o: sum("OUTSTANDING"), sh: sum("SHIPPING") });
  });
});
