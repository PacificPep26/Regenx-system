// Dev tool: opens key pages in headless Chrome at phone width, reports horizontal overflow,
// tiny tap targets and console errors, and saves screenshots to ./.audit/.
// Usage: node --env-file=.env scripts/mobile-audit.mjs [baseUrl]
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3100";
const W = 390, H = 844;
const db = new PrismaClient();
const key = new TextEncoder().encode(process.env.SESSION_SECRET);
mkdirSync(".audit", { recursive: true });

const token = async (email) => {
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  return new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("30m").sign(key);
};
const alphaOrder = await db.order.findFirst({ where: { store: { slug: "alpha" } } });
const alphaCust = await db.customer.findFirst({ where: { store: { slug: "alpha" } } });

const pages = {
  admin: ["/overview", "/gp", "/inbox", "/stores", "/customers", "/users", "/catalog", "/fulfillment", "/statements", "/search?q=a", "/s/alpha/orders", "/s/alpha/customers", "/s/alpha/chat", "/s/alpha/ledger", "/s/alpha/settings"],
  gp: ["/gp", "/fulfillment", "/fulfillment?view=board", "/customers", "/stock", "/stock/history"],
  alpha: ["/s/alpha/orders", "/s/alpha/orders/new", "/s/alpha/orders/import", "/s/alpha/customers", "/s/alpha/customers/new", "/s/alpha/chat", "/s/alpha/ledger", "/s/alpha/statements", "/catalog", "/notifications", "/account",
    ...(alphaOrder ? [`/s/alpha/orders/${alphaOrder.id}`] : []), ...(alphaCust ? [`/s/alpha/customers/${alphaCust.id}`] : [])],
  anon: ["/login", "/forgot-password", "/reset-password?token=x"],
};
const emails = { admin: "admin@regenx.local", gp: "gp@regenx.local", alpha: "alpha@partner.local" };

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
let problems = 0;
for (const [who, list] of Object.entries(pages)) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (emails[who]) await ctx.addCookies([{ name: "rx_session", value: await token(emails[who]), url: BASE }]);
  for (const path of list) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    const res = await page.goto(BASE + path, { waitUntil: "networkidle" }).catch((e) => ({ status: () => 0, err: e }));
    const info = await page.evaluate(() => {
      const vw = window.innerWidth;
      const over = [...document.querySelectorAll("body *")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > vw + 1) && !el.closest("[data-allow-scroll], .overflow-x-auto, .overflow-y-auto") && getComputedStyle(el).position !== "fixed";
      }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 4).join(".")}`);
      const small = [...document.querySelectorAll("a,button,input,select,textarea")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32) && el.type !== "hidden" && el.type !== "checkbox";
      }).length;
      return { scrollW: document.documentElement.scrollWidth, vw, over, small };
    });
    const bad = info.scrollW > info.vw + 1 || errs.length || (res.status && res.status() >= 400 && res.status() !== 404);
    if (bad) problems++;
    console.log(`${bad ? "FAIL" : "ok  "} ${who.padEnd(5)} ${path.slice(0, 48).padEnd(48)} w=${info.scrollW}/${info.vw} small=${info.small}${info.over.length ? " OVER:" + info.over.join(" | ") : ""}${errs.length ? " ERR:" + errs[0].slice(0, 90) : ""}`);
    await page.screenshot({ path: `.audit/${who}-${path.replace(/[^a-z0-9]+/gi, "_").slice(0, 40)}.png` });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
await db.$disconnect();
console.log(problems ? `\n${problems} page(s) with problems` : "\nno overflow / errors");
