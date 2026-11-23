import { describe, it, expect, beforeAll, afterAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("adding funds to a store (db)", async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import("@/lib/db");
  const { recordPayment } = await import("@/lib/orders");
  const admin = { id: "admin-user", role: "ADMIN" };
  let storeId = "";

  beforeAll(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "Notification","AuditLog","Statement","LedgerEntry","Payment","OrderItem","Order","Customer","User","Store" CASCADE`);
    storeId = (await db.store.create({ data: { name: "New", slug: "new", tier: "STARTER", requiredBalanceCents: 1_000_000, discountBps: 500, status: "PENDING", allowedRegions: ["US"] } })).id;
  });
  afterAll(() => db.$disconnect());

  it("a partial deposit credits the account but keeps the store pending", async () => {
    await recordPayment(storeId, admin, { amountCents: 400_000, method: "WIRE", reference: "W1" });
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    expect(s.creditCents).toBe(400_000);
    expect(s.status).toBe("PENDING");
  });

  it("reaching the required deposit activates the store and tells the partner", async () => {
    await recordPayment(storeId, admin, { amountCents: 600_000, method: "ACH" });
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    expect(s).toMatchObject({ creditCents: 1_000_000, status: "ACTIVE" });
    expect(await db.notification.count({ where: { storeId, audience: "STORE", title: { contains: "active" } } })).toBe(1);
  });

  it("money owed is paid first: outstanding, then shipping, then credit", async () => {
    await db.ledgerEntry.createMany({
      data: [
        { storeId, bucket: "OUTSTANDING", type: "OVERAGE", amountCents: 50_000 },
        { storeId, bucket: "SHIPPING", type: "SHIPPING_CHARGE", amountCents: 2_000 },
        { storeId, bucket: "CREDIT", type: "ADJUSTMENT", amountCents: -100_000 },
      ],
    });
    await recordPayment(storeId, admin, { amountCents: 100_000, method: "WIRE" });
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    expect({ c: s.creditCents, o: s.outstandingCents, sh: s.shippingCents }).toEqual({ c: 900_000 + 48_000, o: 0, sh: 0 });
    await expect(recordPayment(storeId, admin, { amountCents: 0, method: "WIRE" })).rejects.toThrow(/positive/);
  });
});
