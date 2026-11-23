// Dev tool: node --env-file=.env scripts/console-errors.mjs /path [...]  -> full console errors per page (as alpha partner)
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
const BASE = "http://localhost:3100";
const db = new PrismaClient();
const u = await db.user.findUniqueOrThrow({ where: { email: process.env.AS ?? "alpha@partner.local" } });
const token = await new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(new TextEncoder().encode(process.env.SESSION_SECRET));
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies([{ name: "rx_session", value: token, url: BASE }]);
for (const path of process.argv.slice(2)) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  console.log(`\n### ${path}: ${errs.length} error(s)`);
  for (const e of errs.slice(0, 2)) console.log(e.slice(0, 1400));
  await page.close();
}
await browser.close();
await db.$disconnect();
