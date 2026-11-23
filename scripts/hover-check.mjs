// Dev tool: hovers real buttons in headless Chrome and prints computed colours + cursor.
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3100";
const db = new PrismaClient();
const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const u = await db.user.findUniqueOrThrow({ where: { email: "alpha@partner.local" } });
const o = await db.order.findFirst({ where: { store: { slug: "alpha" }, status: "APPROVED" } });
const token = await new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(key);

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addCookies([{ name: "rx_session", value: token, url: BASE }]);
const page = await ctx.newPage();

const check = async (label, sel) => {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  const before = await loc.evaluate((el) => { const c = getComputedStyle(el); return `bg=${c.backgroundColor} text=${c.color} cursor=${c.cursor}`; });
  await loc.hover();
  await page.waitForTimeout(250);
  const after = await loc.evaluate((el) => { const c = getComputedStyle(el); return `bg=${c.backgroundColor} text=${c.color} cursor=${c.cursor}`; });
  console.log(`${label}\n  normal: ${before}\n  hover : ${after}\n  ${before === after ? "NO CHANGE" : "changes"}`);
};

if (o) {
  await page.goto(`${BASE}/s/alpha/orders/${o.id}`, { waitUntil: "networkidle" });
  await check("Cancel order (btn-danger)", "button:has-text('Cancel order')");
  await page.screenshot({ path: ".audit/hover-cancel.png", clip: { x: 260, y: 200, width: 700, height: 200 } });
}
await page.goto(`${BASE}/s/alpha/orders`, { waitUntil: "networkidle" });
await check("+ New order (btn-primary)", "a:has-text('New order')");
await check("Import CSV (btn)", "a:has-text('Import CSV')");
await check("sidebar link Customers", "aside a:has-text('Customers')");
await browser.close();
await db.$disconnect();
