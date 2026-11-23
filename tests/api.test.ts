import { describe, it, expect, beforeAll, afterAll } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("Premium order API (db)", async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import("@/lib/db");
  const { createApiKey, revokeApiKey } = await import("@/lib/apiKeys");
  const { POST, GET } = await import("@/app/api/v1/orders/route");
  const { GET: GET_ONE } = await import("@/app/api/v1/orders/[id]/route");
  let premium = "", starter = "", keyA = "", keyStarter = "", keyOther = "", keyAId = "";

  const call = (fn: typeof POST | typeof GET, key: string | null, body?: unknown, path = "/api/v1/orders") =>
    fn(new Request("http://x" + path, { method: body ? "POST" : "GET", headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const order = (ref: string, sku = "API-1", qty = 2) => ({
    externalRef: ref,
    customer: { name: "Jane Smith", email: `${ref}@x.com`, phone: "5125550100", line1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "US" },
    items: [{ sku, qty }],
  });

  beforeAll(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "ApiKey","ProductDoc","StockMovement","Notification","AuditLog","Message","ChatRead","SavedView","StoreSeen","Statement","LedgerEntry","Payment","OrderItem","Order","Customer","User","Store","Product" CASCADE`);
    await db.product.create({ data: { sku: "API-1", name: "Api Product", strength: "5mg", basePriceCents: 10_000 } });
    const mk = (slug: string, tier: "PREMIUM" | "STARTER", bps: number) =>
      db.store.create({ data: { name: slug, slug, tier, requiredBalanceCents: 5_000_000, discountBps: bps, status: "ACTIVE", allowedRegions: ["US"] } }).then(async (s) => {
        await db.ledgerEntry.create({ data: { storeId: s.id, bucket: "CREDIT", type: "DEPOSIT", amountCents: 5_000_000 } });
        return s.id;
      });
    premium = await mk("prem", "PREMIUM", 1000);
    starter = await mk("start", "STARTER", 500);
    const other = await mk("prem2", "PREMIUM", 1000);
    const a = await createApiKey(premium, "shop");
    keyA = a.key; keyAId = a.id;
    keyStarter = (await createApiKey(starter, "x")).key;
    keyOther = (await createApiKey(other, "y")).key;
  });
  afterAll(() => db.$disconnect());

  it("stores only a hash of the key", async () => {
    const row = await db.apiKey.findFirstOrThrow({ where: { storeId: premium } });
    expect(row.keyHash).not.toContain(keyA);
    expect(keyA.startsWith(row.prefix)).toBe(true);
    expect(keyA.startsWith("rxk_")).toBe(true);
  });

  it("rejects missing, malformed, unknown keys, and Starter stores", async () => {
    expect((await call(POST, null, order("r0"))).status).toBe(401);
    expect((await call(POST, "rxk_" + "x".repeat(30), order("r0"))).status).toBe(401);
    expect((await call(POST, keyStarter, order("r0"))).status).toBe(403);
  });

  it("creates, submits and prices an order (Premium 10% off), debiting credit", async () => {
    const r = await call(POST, keyA, order("WEB-1"));
    expect(r.status).toBe(201);
    const { order: o } = await r.json();
    expect(o).toMatchObject({ externalRef: "WEB-1", status: "APPROVED", wholesaleTotalCents: 18_000, discountBps: 1000, items: [{ sku: "API-1", qty: 2, unitPriceCents: 10_000 }] });
    expect((await db.store.findUniqueOrThrow({ where: { id: premium } })).creditCents).toBe(5_000_000 - 18_000);
  });

  it("is idempotent on externalRef and validates SKUs / input", async () => {
    const dup = await call(POST, keyA, order("WEB-1"));
    expect(dup.status).toBe(409);
    expect(await db.order.count({ where: { storeId: premium } })).toBe(1);
    const bad = await call(POST, keyA, order("WEB-2", "NOPE"));
    expect(bad.status).toBe(422);
    expect((await bad.json()).skus).toEqual(["NOPE"]);
    const invalid = await call(POST, keyA, { ...order("WEB-3"), customer: { name: "x" } });
    expect(invalid.status).toBe(422);
  });

  it("over-credit order is saved but held, and a store cannot read another store's order", async () => {
    const big = await call(POST, keyA, order("WEB-BIG", "API-1", 1000)); // 1000 x $90 = $90,000 > credit
    expect(big.status).toBe(201);
    const { order: o } = await big.json();
    expect(o.status).toBe("ON_HOLD");
    expect(o.overageCents).toBeGreaterThan(0);
    const one = (key: string) => GET_ONE(new Request("http://x", { headers: { authorization: `Bearer ${key}` } }), { params: Promise.resolve({ id: o.id }) });
    expect((await one(keyOther)).status).toBe(404);
    expect((await one(keyA)).status).toBe(200);
    const list = await (await call(GET, keyA, undefined, "/api/v1/orders?externalRef=WEB-1")).json();
    expect(list.orders).toHaveLength(1);
  });

  it("a revoked key stops working immediately", async () => {
    await revokeApiKey(keyAId, premium);
    expect((await call(POST, keyA, order("WEB-9"))).status).toBe(401);
  });
});
