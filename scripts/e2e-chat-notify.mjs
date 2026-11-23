// Dev tool: partner sends a chat message; checks the admin's open page gets a live toast + badges, then clears them.
import { chromium } from "playwright-core";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
const BASE = "http://localhost:3100";
const db = new PrismaClient();
const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const tok = async (email) => { const u = await db.user.findUniqueOrThrow({ where: { email } }); return new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(key); };
const ok = (c, m) => console.log(`${c ? "ok  " : "FAIL"} ${m}`);

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const mk = async (email, vp) => { const ctx = await browser.newContext({ viewport: vp }); await ctx.addCookies([{ name: "rx_session", value: await tok(email), url: BASE }]); return ctx.newPage(); };
const admin = await mk("admin@regenx.local", { width: 1280, height: 800 });
const gp = await mk("gp@regenx.local", { width: 1280, height: 800 });
const partner = await mk("alpha@partner.local", { width: 390, height: 844 });

await admin.goto(BASE + "/overview", { waitUntil: "networkidle" });
await gp.goto(BASE + "/gp", { waitUntil: "networkidle" });
await partner.goto(BASE + "/s/alpha/chat", { waitUntil: "networkidle" });

const text = `live test ${Date.now()}`;
await partner.fill("textarea", text);
await partner.click("button:has-text('Send')");
await partner.waitForSelector(`text=${text}`);
ok(true, "partner sent a chat message");

// admin never reloads: the sidebar poll (8s) should surface it
await admin.waitForSelector("[role=status]", { timeout: 20000 }).catch(() => {});
const toast = await admin.locator("[role=status]").innerText().catch(() => "");
ok(/Message from Alpha/.test(toast), `admin toast appears without reload: "${toast.replace(/\n/g, " ")}"`);
const inboxBadge = await admin.locator("aside a[href='/inbox'] span.bg-red").innerText().catch(() => "");
ok(inboxBadge === "1", `admin Inbox badge = ${JSON.stringify(inboxBadge)}`);
await admin.screenshot({ path: ".audit/live-admin.png" });

await gp.waitForSelector("[role=status]", { timeout: 20000 }).catch(() => {});
ok(/Message from Alpha/.test(await gp.locator("[role=status]").innerText().catch(() => "")), "GP also gets the toast");

// admin opens the store chat -> unread clears
await admin.goto(BASE + "/s/alpha/chat", { waitUntil: "networkidle" });
await admin.waitForSelector(`text=${text}`);
await admin.waitForTimeout(9000);
const after = await admin.locator("aside a[href='/inbox'] span.bg-red").count();
ok(after === 0, "Inbox badge clears after reading the chat");
await admin.screenshot({ path: ".audit/live-admin-after.png" });

// admin replies -> partner (on a different page) gets toast + Chat badge
await partner.goto(BASE + "/s/alpha/orders", { waitUntil: "networkidle" });
await admin.fill("textarea", "reply from admin");
await admin.click("button:has-text('Send')");
await partner.waitForSelector("[role=status]", { timeout: 20000 }).catch(() => {});
const pt = await partner.locator("[role=status]").innerText().catch(() => "");
ok(/RegenX/.test(pt), `partner toast: "${pt.replace(/\n/g, " ")}"`);
await partner.screenshot({ path: ".audit/live-partner.png" });

await browser.close();
await db.$disconnect();
