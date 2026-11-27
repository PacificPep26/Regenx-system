import { describe, it, expect, beforeAll, afterAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

// Program model: adding inventory charges the cost of goods (wholesale, from credit; over credit waits ON_HOLD) and the
// units join the store's own stock right away. A customer order takes units from that stock and does not charge the goods again.
run("store inventory, customer orders and top-ups (db)", async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import("@/lib/db");
  const { submitOrder, cancelOrder, markShipped } = await import("@/lib/orders");
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
  const addInventory = async (qty: number) => {
    const id = await inv.createInventoryDraft(storeId, admin.id, { items: [{ productId: product, qty }] });
    return { id, status: await inv.submitInventoryOrder(id, owner) };
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

  it("a customer order is blocked until the store has inventory, and the attempt charges nothing", async () => {
    await expect(submitOrder(await customerOrder(1), admin)).rejects.toThrow(/Not enough in your inventory/);
    expect((await bal()).credit).toBe(100_000);
  });

  it("adding inventory needs a received deposit, charges the goods at wholesale and stocks the units at once", async () => {
    await db.store.update({ where: { id: storeId }, data: { status: "PENDING" } });
    const draft = await inv.createInventoryDraft(storeId, admin.id, { items: [{ productId: product, qty: 1 }] });
    await expect(inv.submitInventoryOrder(draft, owner)).rejects.toThrow(/deposit/);
    await db.store.update({ where: { id: storeId }, data: { status: "ACTIVE" } });
    await inv.cancelInventoryOrder(draft, owner);

    const { id, status } = await addInventory(5); // $500 of $1000
    expect(status).toBe("RECEIVED");
    expect((await bal()).credit).toBe(50_000);
    expect(await db.ledgerEntry.count({ where: { storeId, inventoryOrderId: id, type: "ORDER_DEBIT" } })).toBe(1);
    expect(await stock()).toEqual({ onHand: 5, reserved: 0 });
    await expect(inv.submitInventoryOrder(id, owner)).rejects.toThrow(/draft/);
    await expect(inv.cancelInventoryOrder(id, owner)).rejects.toThrow(/Cannot cancel/);
  });

  it("a customer order takes units from the store's stock and does not charge the goods again", async () => {
    const a = await customerOrder(3);
    expect(await submitOrder(a, admin)).toBe("APPROVED");
    expect((await bal()).credit).toBe(50_000); // unchanged
    expect(await db.ledgerEntry.count({ where: { orderId: a } })).toBe(0);
    expect(await stock()).toEqual({ onHand: 5, reserved: 3 });
    await expect(submitOrder(await customerOrder(3), admin)).rejects.toThrow(/need 3, you have 2/);
  });

  it("shipping takes the units out of stock and bills only the shipping; cancelling gives the units back", async () => {
    const shipId = (await db.order.findFirstOrThrow({ where: { storeId, status: "APPROVED" } })).id;
    await markShipped(shipId, gp, { carrier: "UPS", trackingNo: "1Z", shippingFeeCents: 500 });
    expect(await stock()).toEqual({ onHand: 2, reserved: 0 });
    expect(await bal()).toMatchObject({ credit: 50_000, shipping: 500 });
    const b = await customerOrder(2);
    await submitOrder(b, admin);
    expect(await stock()).toEqual({ onHand: 2, reserved: 2 });
    await cancelOrder(b, admin);
    expect(await stock()).toEqual({ onHand: 2, reserved: 0 });
    expect((await bal()).credit).toBe(50_000);
  });

  it("inventory above your credit waits ON_HOLD with the overage as outstanding; approval stocks it; a held one can be cancelled", async () => {
    await db.ledgerEntry.create({ data: { storeId, bucket: "CREDIT", type: "ADJUSTMENT", amountCents: -45_000 } }); // credit 5,000
    const held = await addInventory(2); // $200 against $50
    expect(held.status).toBe("ON_HOLD");
    expect(await bal()).toMatchObject({ credit: 0, outstanding: 15_000 });
    expect(await stock()).toEqual({ onHand: 2, reserved: 0 }); // not stocked yet
    await inv.approveInventoryHold(held.id, admin);
    expect(await stock()).toEqual({ onHand: 4, reserved: 0 });
    await expect(inv.approveInventoryHold(held.id, admin)).rejects.toThrow(/not on hold/);

    const second = await addInventory(1); // $100, credit is 0 -> held
    expect(second.status).toBe("ON_HOLD");
    expect((await bal()).outstanding).toBe(25_000);
    await inv.cancelInventoryOrder(second.id, owner, "changed my mind");
    expect((await bal()).outstanding).toBe(15_000);
    expect(await stock()).toEqual({ onHand: 4, reserved: 0 });
  });

  it("top-up: only the owner asks, one request at a time, the admin records the payment (owed money first) and closes it", async () => {
    await expect(requestTopUp(storeId, gp, 10_000)).rejects.toThrow(/owner/);
    const id = await requestTopUp(storeId, owner, 20_000, "wire sent");
    await expect(requestTopUp(storeId, owner, 1_000)).rejects.toThrow(/already/);
    expect(await db.notification.count({ where: { audience: "ADMIN", title: { contains: "top-up" } } })).toBe(1);
    await fulfillTopUp(id, admin, { amountCents: 20_000, method: "WIRE", reference: "W9" });
    expect(await bal()).toEqual({ credit: 4_500, outstanding: 0, shipping: 0 }); // 20,000 - 15,000 outstanding - 500 shipping
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
