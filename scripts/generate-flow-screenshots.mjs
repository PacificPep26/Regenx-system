import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const db = new PrismaClient();
const key = new TextEncoder().encode(process.env.SESSION_SECRET);

const ARTIFACT_DIR = "C:/Users/HP/.gemini/antigravity/brain/e692306b-939b-428c-ab7c-529e546abaf5";
const AUDIT_FLOW_DIR = resolve(".audit/flow");
mkdirSync(AUDIT_FLOW_DIR, { recursive: true });
mkdirSync(ARTIFACT_DIR, { recursive: true });

async function getToken(email) {
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  return new SignJWT({ uid: u.id, v: u.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("2h")
    .sign(key);
}

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

async function saveShot(page, filename) {
  const p1 = join(AUDIT_FLOW_DIR, filename);
  const p2 = join(ARTIFACT_DIR, filename);
  await page.screenshot({ path: p1, fullPage: false });
  copyFileSync(p1, p2);
  console.log(`Saved: ${filename}`);
}

try {
  // Context 1: Partner (alpha@partner.local)
  const partnerCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
  });
  const partnerToken = await getToken("alpha@partner.local");
  await partnerCtx.addCookies([{ name: "rx_session", value: partnerToken, url: BASE }]);
  const page = await partnerCtx.newPage();

  // 1. Order Creation Form
  await page.goto(`${BASE}/s/alpha/orders/new`, { waitUntil: "networkidle" });
  if (await page.locator("button:text-is('New')").count()) {
    await page.click("button:text-is('New')");
  }
  const timestamp = Date.now().toString().slice(-4);
  await page.fill("#c-name", `Robert Davis`);
  await page.fill("#c-email", `robert.davis${timestamp}@example.com`);
  await page.fill("#c-phone", "(415) 889-2311");
  await page.selectOption("#c-country", "US");
  await page.fill("#c-line1", "742 Montgomery St");
  await page.fill("#c-city", "San Francisco");
  await page.selectOption("#c-region", "CA");
  await page.fill("#c-postalCode", "94111");
  await page.fill("#c-notes", "Urgent patient replenishment order");

  await saveShot(page, "step1_partner_order_form.png");

  // 2. Open Product Picker Modal
  await page.click("button:has-text('Add products')");
  await page.waitForSelector("[role=dialog]");
  await page.fill("[role=dialog] input[type=search]", "BPC");
  await page.waitForTimeout(400);

  // Add BPC item
  const addBtn = page.locator("[role=dialog] button[aria-label^='Add BPC']").first();
  await addBtn.click();
  const incBtn = page.locator("[role=dialog] button[aria-label='Increase']").first();
  await incBtn.click(); // qty = 2
  await page.waitForTimeout(300);

  await saveShot(page, "step2_product_picker_modal.png");

  // 3. Close Picker, Review Form with Calculations
  await page.keyboard.press("Escape");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  await page.waitForTimeout(300);

  await saveShot(page, "step3_order_form_calculated.png");

  // 4. Submit Order directly
  await page.click("button:has-text('Submit order')");
  await page.waitForURL((u) => /\/orders\/c[a-z0-9]{20,}/.test(u.pathname), { timeout: 15000 });
  await page.waitForTimeout(500);

  const orderUrl = page.url();
  console.log(`Submitted order url: ${orderUrl}`);
  await saveShot(page, "step4_order_submitted_approved.png");

  // 5. Check Partner Notifications Page
  await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await saveShot(page, "step5_partner_notifications.png");

  await partnerCtx.close();

  // Context 2: Admin (admin@regenx.local)
  const adminCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
  });
  const adminToken = await getToken("admin@regenx.local");
  await adminCtx.addCookies([{ name: "rx_session", value: adminToken, url: BASE }]);
  const adminPage = await adminCtx.newPage();

  // Admin Overview with New Orders badge and stats
  await adminPage.goto(`${BASE}/overview`, { waitUntil: "networkidle" });
  await adminPage.waitForTimeout(400);
  await saveShot(page ? adminPage : page, "step6_admin_overview_badge.png");

  // Admin Notification Bell Open
  const bell = adminPage.locator("aside button[aria-label='Notifications']");
  if (await bell.count()) {
    await bell.click();
    await adminPage.waitForSelector("[role=dialog][aria-label='Notifications']");
    await adminPage.waitForTimeout(500);
    await saveShot(adminPage, "step7_admin_notification_bell.png");
    await adminPage.keyboard.press("Escape");
  }

  // Admin Notifications / Inbox Page
  await adminPage.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  await adminPage.waitForTimeout(400);
  await saveShot(adminPage, "step8_admin_notifications_list.png");

  await adminCtx.close();

  // Context 3: Fulfillment / GP (gp@regenx.local)
  const gpCtx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1.5,
  });
  const gpToken = await getToken("gp@regenx.local");
  await gpCtx.addCookies([{ name: "rx_session", value: gpToken, url: BASE }]);
  const gpPage = await gpCtx.newPage();

  await gpPage.goto(`${BASE}/fulfillment`, { waitUntil: "networkidle" });
  await gpPage.waitForTimeout(400);
  await saveShot(gpPage, "step9_gp_fulfillment_queue.png");

  await gpCtx.close();

  console.log("ALL SCREENSHOTS CAPTURED SUCCESSFULLY!");
} catch (err) {
  console.error("Error during capture:", err);
} finally {
  await browser.close();
  await db.$disconnect();
}
