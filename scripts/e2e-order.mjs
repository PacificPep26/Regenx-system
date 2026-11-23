// Dev tool: drives the new-order form like a partner on a phone (headless Chrome), with screenshots in ./.audit/.
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3100";
const db = new PrismaClient();
const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const u = await db.user.findUniqueOrThrow({ where: { email: "alpha@partner.local" } });
const token = await new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(key);

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: "rx_session", value: token, url: BASE }]);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const ok = (c, msg) => console.log(`${c ? "ok  " : "FAIL"} ${msg}`);

await page.goto(`${BASE}/s/alpha/orders/new`, { waitUntil: "networkidle" });
// customer: Vietnam address (non-US); stores that already have customers default to "Existing"
if (await page.locator("button:text-is('New')").count()) await page.click("button:text-is('New')");
await page.fill("#c-name", "Vu Huynh Hoang");
await page.fill("#c-email", `hoang${Date.now()}@example.com`);
await page.fill("#c-phone", "0901 234 567");
await page.selectOption("#c-country", "VN");
ok(await page.locator("#c-region").evaluate((e) => e.tagName === "INPUT"), "non-US country turns State into free text");
await page.fill("#c-line1", "304 Bau Cat");
await page.fill("#c-city", "Ho Chi Minh");
await page.fill("#c-region", "Ho Chi Minh City");
await page.fill("#c-postalCode", "70000");

// product picker modal
await page.click("text=Add products");
await page.waitForSelector("[role=dialog]");
await page.fill("[role=dialog] input[type=search]", "BPC");
await page.waitForTimeout(300);
await page.screenshot({ path: ".audit/e2e-picker.png" });
await page.locator("[role=dialog] button[aria-label^='Add BPC']").first().click();
await page.locator("[role=dialog] button[aria-label='Increase']").first().click();
const qty = await page.locator("[role=dialog] input[aria-label^='Quantity']").first().inputValue();
ok(qty === "2", `quantity stepper works (qty=${qty})`);
await page.keyboard.press("Escape");
await page.waitForSelector("[role=dialog]", { state: "detached" });
ok(await page.locator("text=Add products (1)").count() === 1, "modal closed, selection kept (1 line)");
await page.screenshot({ path: ".audit/e2e-form-after.png", fullPage: true });

// save as draft -> detail page
await page.click("button:has-text('Save draft')");
await page.waitForURL((u) => /\/orders\/c[a-z0-9]{20,}/.test(u.pathname), { timeout: 15000 });
const orderId = page.url().match(/orders\/(c[a-z0-9]+)/)[1];
const saved = await db.order.findUnique({ where: { id: orderId }, include: { items: true, customer: true } });
ok(saved?.status === "DRAFT" && saved.shipCountry === "VN" && saved.shipRegion === "HO CHI MINH CITY" && saved.items[0]?.qty === 2 && saved.customer.phone === "0901 234 567",
  `draft saved in DB: status=${saved?.status} country=${saved?.shipCountry} region=${saved?.shipRegion} qty=${saved?.items[0]?.qty}`);
await page.screenshot({ path: ".audit/e2e-draft.png", fullPage: true });

// submit: store only ships to US, so VN must be refused with a clear message
await page.click("button:has-text('Submit order')");
await page.waitForTimeout(1500);
const body = await page.locator("main").innerText();
ok(/not authorized/i.test(body), "VN destination refused on submit (store allows US only)");
await page.screenshot({ path: ".audit/e2e-refused.png", fullPage: true });

ok(errs.length === 0, errs.length ? `console errors: ${errs[0]}` : "no console errors");
await browser.close();
await db.$disconnect();
