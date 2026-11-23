// Dev tool: Premium owner creates an API key in the UI, places an order through the public API, then cleans up its own rows.
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
const BASE = process.argv[2] ?? "http://localhost:3100";
const db = new PrismaClient();
const sk = new TextEncoder().encode(process.env.SESSION_SECRET);
const tok = async (email) => { const u = await db.user.findUniqueOrThrow({ where: { email } }); return new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(sk); };
const ok = (c, m) => console.log((c ? "ok   " : "FAIL ") + m);
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const mk = async (email) => { const c = await b.newContext({ viewport: { width: 1100, height: 900 } }); await c.addCookies([{ name: "rx_session", value: await tok(email), url: BASE }]); const p = await c.newPage(); p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 120))); return p; };
const store = await db.store.findUniqueOrThrow({ where: { slug: "beta" } });
try {
  const prem = await mk("beta@partner.local");
  await prem.goto(BASE + "/s/beta/plan", { waitUntil: "networkidle" });
  await prem.fill("input[name=name]", "e2e key");
  await prem.click("button:has-text('Create key')");
  await prem.waitForSelector("code.select-all");
  const key = (await prem.locator("code.select-all").first().innerText()).trim();
  ok(/^rxk_[A-Za-z0-9_-]{20,}$/.test(key), "Premium owner created an API key from the UI (shown once)");
  const sku = (await db.product.findFirstOrThrow({ where: { restricted: false, active: true } })).sku;
  const body = { externalRef: "E2E-API-1", customer: { name: "API Customer", email: "api.e2e@example.com", phone: "5125550100", line1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "US" }, items: [{ sku, qty: 2 }] };
  const H = { Authorization: "Bearer " + key, "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/v1/orders", { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  ok(r.status === 201 && j.order.status === "APPROVED", "POST /api/v1/orders -> " + r.status + " " + j.order?.status + " #" + j.order?.number);
  const r2 = await fetch(BASE + "/api/v1/orders", { method: "POST", headers: H, body: JSON.stringify(body) });
  ok(r2.status === 409, "same externalRef again -> " + r2.status + " (no duplicate)");
  const g = await fetch(BASE + "/api/v1/orders/" + j.order.id, { headers: H });
  ok(g.status === 200, "GET order status/tracking -> " + g.status);
  const nokey = await fetch(BASE + "/api/v1/orders", { method: "POST", body: "{}" });
  ok(nokey.status === 401 && (nokey.headers.get("content-type") ?? "").includes("json"), "no key -> " + nokey.status + " JSON (not a login redirect)");
  const gp = await mk("gp@regenx.local");
  await gp.goto(BASE + "/gp", { waitUntil: "networkidle" });
  ok(/Priority/i.test(await gp.locator("main").innerText()), "GP queue flags the Premium store order as Priority");
} finally {
  const ids = (await db.order.findMany({ where: { storeId: store.id, externalRef: "E2E-API-1" }, select: { id: true } })).map((o) => o.id);
  await db.stockMovement.deleteMany({ where: { orderId: { in: ids } } });
  await db.ledgerEntry.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.customer.deleteMany({ where: { storeId: store.id, email: "api.e2e@example.com" } });
  await db.apiKey.deleteMany({ where: { storeId: store.id, name: "e2e key" } });
  await db.notification.deleteMany({ where: { title: { contains: "New order Beta" } } });
  await db.auditLog.deleteMany({ where: { OR: [{ action: { startsWith: "apikey." } }, { actorId: { startsWith: "api:" } }] } });
  await db.store.update({ where: { id: store.id }, data: { nextOrderNumber: 1001 } });
  const s2 = await db.store.findUnique({ where: { id: store.id } });
  console.log("cleaned up; beta credit", s2.creditCents / 100, "| orders", await db.order.count({ where: { storeId: store.id } }), "| keys", await db.apiKey.count({ where: { storeId: store.id } }));
}
await b.close(); await db.$disconnect();
