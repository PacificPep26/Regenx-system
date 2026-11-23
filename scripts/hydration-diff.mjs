// Dev tool: prints the full React hydration diff for a page (phone emulation like mobile-audit).
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const u = await db.user.findUniqueOrThrow({ where: { email: process.env.AS ?? "alpha@partner.local" } });
const token = await new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(new TextEncoder().encode(process.env.SESSION_SECRET));
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addCookies([{ name: "rx_session", value: token, url: "http://localhost:3100" }]);
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://localhost:3100" + process.argv[2], { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const e = errs.find((x) => /hydrat/i.test(x));
console.log(e ? e.slice(0, 3000) : "no hydration error");
await browser.close(); await db.$disconnect();
