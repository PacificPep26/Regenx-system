import { describe, it, expect, beforeAll, afterAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("store stock: admin adjustments and low-stock alerts (db)", async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import("@/lib/db");
  const { submitOrder } = await import("@/lib/orders");
  const { adjustStoreStock, setReorderLevel } = await import("@/lib/inventory");
  const admin = { id: "admin-user", role: "ADMIN" };
  const owner = { id: "owner-user", role: "PARTNER_OWNER" };
  const staff = { id: "staff-user", role: "PARTNER_STAFF" };
  let storeId = "", customerId = "", product = "", n = 0;

  const stock = async () => {
    const s = await db.storeStock.findUnique({ where: { storeId_productId: { storeId, productId: product } } });
    return { onHand: s?.onHand ?? 0, reserved: s?.reserved ?? 0 };
  };
  const lowAlerts = () => db.notification.count({ where: { audience: "STORE", storeId, title: { contains: "Low stock" } } });
  const customerOrder = async (qty: number) => {
    n += 1;
    const s = await db.store.update({ where: { id: storeId }, data: { nextOrderNumber: { increment: 1 } } });
    return (await db.order.create({ data: { storeId, number: s.nextOrderNumber - 1, customerId, shipName: "T", shipLine1: "1", shipCity: "A", shipRegion: "TX", shipPostalCode: "1", shipCountry: "US", items: { create: [{ productId: product, qty, unitPriceCents: 0 }] } } })).id;
  };

  beforeAll(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "StoreStockMovement","StoreStock","InventoryOrderItem","InventoryOrder","Notification","AuditLog","Statement","LedgerEntry","Payment","OrderItem","Order","Customer","User","Store","Product" CASCADE`);
    product = (await db.product.create({ data: { sku: "A-1", name: "Adj", strength: "5mg", basePriceCents: 10_000 } })).id;
    storeId = (await db.store.create({ data: { name: "A", slug: "a", tier: "STARTER", requiredBalanceCents: 100_000, discountBps: 0, status: "ACTIVE", allowedRegions: ["US"], inventoryMode: true } })).id;
    await db.ledgerEntry.create({ data: { storeId, bucket: "CREDIT", type: "DEPOSIT", amountCents: 10_000_000 } }); // enough credit that orders are approved, not held
    customerId = (await db.customer.create({ data: { storeId, name: "T", email: "t@x.com", phone: "5551234", line1: "1", city: "A", region: "TX", postalCode: "1" } })).id;
  });
  afterAll(() => db.$disconnect());

  it("only an admin adjusts, with a reason, by a whole number, and money does not move", async () => {
    await expect(adjustStoreStock(storeId, product, 5, "recount", owner)).rejects.toThrow(/admin/);
    await expect(adjustStoreStock(storeId, product, 0, "recount", admin)).rejects.toThrow(/whole number/);
    await expect(adjustStoreStock(storeId, product, 5, "x", admin)).rejects.toThrow(/reason/);
    await expect(adjustStoreStock(storeId, product, -1, "nothing there", admin)).rejects.toThrow(/negative/);
    await adjustStoreStock(storeId, product, 10, "opening balance", admin);
    expect(await stock()).toEqual({ onHand: 10, reserved: 0 });
    expect(await db.ledgerEntry.count({ where: { storeId, type: { not: "DEPOSIT" } } })).toBe(0);
    expect(await db.notification.count({ where: { audience: "STORE", storeId, title: { contains: "Stock adjusted" } } })).toBe(1);
  });

  it("cannot take on-hand below what open orders have reserved", async () => {
    await submitOrder(await customerOrder(4), admin);
    expect(await stock()).toEqual({ onHand: 10, reserved: 4 });
    await expect(adjustStoreStock(storeId, product, -7, "damaged", admin)).rejects.toThrow(/reserved/);
    await adjustStoreStock(storeId, product, -6, "damaged", admin);
    expect(await stock()).toEqual({ onHand: 4, reserved: 4 });
  });

  it("the owner sets a minimum; staff cannot; the low alert fires once and re-arms after recovery", async () => {
    await expect(setReorderLevel(storeId, product, 3, staff)).rejects.toThrow(/owner/);
    await expect(setReorderLevel(storeId, product, -1, owner)).rejects.toThrow(/whole number/);
    await adjustStoreStock(storeId, product, 20, "restock", admin); // available 20
    await setReorderLevel(storeId, product, 5, owner);
    expect(await lowAlerts()).toBe(0);
    await submitOrder(await customerOrder(12), admin); // available 8
    expect(await lowAlerts()).toBe(0);
    await submitOrder(await customerOrder(3), admin); // available 5 -> alert
    expect(await lowAlerts()).toBe(1);
    await submitOrder(await customerOrder(1), admin); // available 4 -> still low, no second alert
    expect(await lowAlerts()).toBe(1);
    await adjustStoreStock(storeId, product, 10, "restock", admin); // available 14 -> re-armed
    await submitOrder(await customerOrder(9), admin); // available 5 -> alert again
    expect(await lowAlerts()).toBe(2);
  });

  it("cached stock equals the journal", async () => {
    const mv = await db.storeStockMovement.aggregate({ where: { storeId }, _sum: { onHandDelta: true, reservedDelta: true } });
    expect(await stock()).toEqual({ onHand: mv._sum.onHandDelta ?? 0, reserved: mv._sum.reservedDelta ?? 0 });
  });
});
