// Dev tool: GP ships an order with a fee, then corrects the fee in the UI; restores the order afterwards.
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
const BASE = process.argv[2] ?? "http://localhost:3100";
const db = new PrismaClient();
const sk = new TextEncoder().encode(process.env.SESSION_SECRET);
const tok = async (email) => { const u = await db.user.findUniqueOrThrow({ where: { email } }); return new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(sk); };
const ok = (c, m) => console.log((c ? "ok   " : "FAIL ") + m);
const order = await db.order.findFirstOrThrow({ where: { status: "APPROVED" }, include: { store: true }, orderBy: { number: "asc" } });
const ship = async () => (await db.store.findUniqueOrThrow({ where: { id: order.storeId } })).shippingCents;
const startShip = await ship();
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } });
await ctx.addCookies([{ name: "rx_session", value: await tok("gp@regenx.local"), url: BASE }]);
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 120)));
try {
  await p.goto(`${BASE}/fulfillment/${order.id}`, { waitUntil: "networkidle" });
  await p.click("button:has-text('Mark shipped')");
  await p.fill("input[name=carrier]", "UPS"); await p.fill("input[name=trackingNo]", "1Z999AA1"); await p.fill("input[name=fee]", "12.00");
  await p.click("button:has-text('Confirm shipped')");
  await p.waitForSelector("text=Marked shipped");
  ok((await ship()) === startShip + 1200, `shipped with a $12.00 fee: store shipping due ${(await ship()) / 100}`);
  await p.reload({ waitUntil: "networkidle" });
  ok(await p.locator("button:has-text('Shipping fee')").count() === 1, "'Shipping fee…' button appears on the shipped order");
  await p.click("button:has-text('Shipping fee')");
  await p.fill("input[name=fee]", "0");
  await p.fill("input[name=reason]", "e2e free shipping promo");
  await p.click("button:has-text('Update fee')");
  await p.waitForSelector("text=Shipping fee updated");
  ok((await ship()) === startShip, `fee waived: store shipping due back to ${(await ship()) / 100}`);
  const o2 = await db.order.findUniqueOrThrow({ where: { id: order.id } });
  ok(o2.shippingFeeCents === 0, "order now shows shipping fee $0.00");
} finally {
  await db.stockMovement.deleteMany({ where: { orderId: order.id, type: "SHIP" } });
  await db.ledgerEntry.deleteMany({ where: { orderId: order.id, bucket: "SHIPPING" } });
  await db.order.update({ where: { id: order.id }, data: { status: "APPROVED", shippedAt: null, carrier: null, trackingNo: null, shippingFeeCents: null } });
  await db.notification.deleteMany({ where: { OR: [{ title: { contains: "shipped" } }, { title: { contains: "Shipping fee" } }] } });
  await db.auditLog.deleteMany({ where: { OR: [{ action: "order.ship" }, { action: "order.shipping_fee" }] } });
  console.log("restored; store shipping due", (await ship()) / 100, "| order status", (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status);
}
await b.close(); await db.$disconnect();
