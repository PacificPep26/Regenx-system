// Dev tool: GP receives stock, ships until stock runs short, partner sees the flag. Cleans up its own rows.
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
const BASE = "http://localhost:3100";
const db = new PrismaClient();
const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const tok = async (email) => { const u = await db.user.findUniqueOrThrow({ where: { email } }); return new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(key); };
const ok = (c, m) => console.log(`${c ? "ok  " : "FAIL"} ${m}`);

const candidates = await db.product.findMany({ where: { items: { some: { order: { status: "APPROVED" } } } }, include: { items: { where: { order: { status: "APPROVED" } }, include: { order: true } } } });
const product = candidates.sort((x, y) => y.items.length - x.items.length)[0];
const orders = product.items.map((i) => i.order).sort((a, b) => a.number - b.number);
const need = product.items[0].qty;
console.log(`product ${product.sku}: ${orders.length} approved orders, ${need} unit(s) each`);

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const mk = async (email, vp) => { const ctx = await browser.newContext({ viewport: vp }); await ctx.addCookies([{ name: "rx_session", value: await tok(email), url: BASE }]); const p = await ctx.newPage(); p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 120))); return p; };
const gp = await mk("gp@regenx.local", { width: 1280, height: 900 });
try {
  // 1) receive stock enough for ONE of the orders
  await gp.goto(`${BASE}/stock?q=${product.sku}`, { waitUntil: "networkidle" });
  await gp.click(`li:has-text("${product.sku}") button[aria-expanded]`);
  await gp.fill("form:has-text('Receive stock') input[name=qty]", String(need + 1));
  await gp.fill("form:has-text('Receive stock') input[name=memo]", "e2e receipt");
  await gp.click("form:has-text('Receive stock') button:has-text('Receive')");
  await gp.waitForSelector("text=Stock received.");
  await gp.reload({ waitUntil: "networkidle" });
  const row = await gp.locator(`li:has-text("${product.sku}")`).first().innerText();
  const reserved = orders.length * need;
  ok(row.includes(String(need + 1)) && row.toLowerCase().includes("short"), `row shows on hand ${need + 1}, reserved ${reserved} and a SHORT badge`);
  await gp.screenshot({ path: ".audit/stock-list.png" });

  // 2) ship first order OK, second must be refused (not enough physical stock)
  const ship = async (o) => {
    await gp.goto(`${BASE}/fulfillment/${o.id}`, { waitUntil: "networkidle" });
    await gp.click("button:has-text('Mark shipped')");
    await gp.fill("input[name=carrier]", "UPS");
    await gp.fill("input[name=trackingNo]", "1Z999AA1");
    await gp.fill("input[name=fee]", "0");
    await gp.click("button:has-text('Confirm shipped')");
    await gp.waitForTimeout(1500);
    return gp.locator("main").innerText();
  };
  const first = await ship(orders[0]);
  ok(/Marked shipped/.test(first), `order #${orders[0].number} shipped (stock ${need + 1} -> ${1})`);
  const second = await ship(orders[1]);
  ok(/Not enough stock/.test(second), `order #${orders[1].number} refused: ${(second.match(/Not enough stock[^\n]*/) ?? [""])[0]}`);
  await gp.screenshot({ path: ".audit/stock-refused.png" });
  ok((await db.order.findUniqueOrThrow({ where: { id: orders[1].id } })).status !== "SHIPPED", "refused order stays unshipped in DB");

  // 3) alerts on GP dashboard + partner sees the flag, no numbers
  await gp.goto(`${BASE}/gp`, { waitUntil: "networkidle" });
  ok(await gp.locator("text=Stock alerts").count() > 0, "GP dashboard shows Stock alerts");
  await gp.screenshot({ path: ".audit/stock-gp.png" });
  const partner = await mk("alpha@partner.local", { width: 390, height: 844 });
  await partner.goto(`${BASE}/s/alpha/orders/new`, { waitUntil: "networkidle" });
  await partner.click("text=Add products");
  await partner.fill("[role=dialog] input[type=search]", product.sku.split("-")[0]);
  await partner.waitForTimeout(400);
  const tag = await partner.locator("[role=dialog]").innerText();
  ok(/out of stock|low stock/i.test(tag), "partner picker shows an out/low stock tag");
  ok(!/on hand/i.test(tag), "partner sees no stock quantities");
  await partner.screenshot({ path: ".audit/stock-partner.png" });
} finally {
  // cleanup: undo the data this script created
  await db.order.updateMany({ where: { id: orders[0].id }, data: { status: "APPROVED", shippedAt: null, carrier: null, trackingNo: null, shippingFeeCents: null } });
  await db.stockMovement.deleteMany({ where: { productId: product.id, OR: [{ memo: "e2e receipt" }, { type: "SHIP" }] } });
  await db.product.update({ where: { id: product.id }, data: { trackStock: false, reorderLevel: 0 } });
  await db.notification.deleteMany({ where: { OR: [{ title: { contains: "stock" } }, { title: { contains: "shipped" } }] } });
  await db.auditLog.deleteMany({ where: { OR: [{ action: { startsWith: "stock." } }, { action: "order.ship" }] } });
  await db.ledgerEntry.deleteMany({ where: { type: "SHIPPING_CHARGE" } });
  console.log("cleaned up e2e data");
}
await browser.close();
await db.$disconnect();
