// Load benchmark against a running server + its (scale) database.
// Usage: DATABASE_URL=.../regenx_scale node --env-file=.env scripts/bench.mjs [baseUrl] [label]
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3200";
const LABEL = process.argv[3] ?? "run";
const db = new PrismaClient();
const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const tok = async (email) => { const u = await db.user.findUniqueOrThrow({ where: { email } }); return "rx_session=" + await new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(key); };
const cookies = { admin: await tok("admin@scale.local"), gp: await tok("gp@scale.local"), owner: await tok("owner1@scale.local") };
const whale = (await db.store.findFirstOrThrow({ where: { slug: "s001" } })).slug;
await db.$disconnect();

const PAGES = [
  ["admin", "/overview"], ["admin", "/gp"], ["admin", "/fulfillment"], ["admin", "/fulfillment?view=board"], ["admin", "/stock"], ["admin", "/stock?status=all"],
  ["admin", "/customers"], ["admin", "/customers?q=Customer 3&store=s002"], ["admin", "/stores"], ["admin", "/statements"], ["admin", "/users"], ["admin", "/inbox"], ["admin", "/notifications"],
  ["admin", `/s/${whale}/orders`], ["admin", `/s/${whale}/orders?status=SHIPPED,DELIVERED&min=100&max=900`], ["admin", `/s/${whale}/orders?q=Customer 0-12`], ["admin", `/s/${whale}/orders?page=40`],
  ["admin", `/s/${whale}/orders?view=board`], ["admin", `/s/${whale}/dashboard`], ["admin", `/s/${whale}/customers`], ["admin", `/s/${whale}/ledger`], ["admin", "/search?q=Customer 1-5"], ["admin", "/api/unread"],
  ["owner", `/s/${whale}/dashboard`], ["owner", `/s/${whale}/orders`], ["owner", `/s/${whale}/orders/new`], ["owner", "/api/unread"],
  ["gp", "/gp"], ["gp", "/fulfillment"], ["gp", "/stock"], ["gp", "/api/unread"],
];

const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
async function hit(who, path) {
  const t = performance.now();
  const r = await fetch(BASE + path, { headers: { cookie: cookies[who] }, redirect: "manual" });
  const b = await r.arrayBuffer();
  return { ms: performance.now() - t, status: r.status, kb: b.byteLength / 1024 };
}

console.log(`\n== ${LABEL}: sequential, 1 warm-up + 5 timed per page ==`);
const rows = [];
for (const [who, path] of PAGES) {
  await hit(who, path);
  const t = [];
  let status = 0, kb = 0;
  for (let i = 0; i < 5; i++) { const r = await hit(who, path); t.push(r.ms); status = r.status; kb = r.kb; }
  rows.push({ who, path, p50: pct(t, 50), max: Math.max(...t), status, kb });
  const flag = status !== 200 ? " !!" + status : t.length && pct(t, 50) > 1000 ? " SLOW" : "";
  console.log(`${String(Math.round(pct(t, 50))).padStart(6)} ms  max ${String(Math.round(Math.max(...t))).padStart(6)}  ${String(Math.round(kb)).padStart(5)} KB  ${who.padEnd(5)} ${path}${flag}`);
}

// concurrency: mix of the typical traffic (20 workers, 20 s)
const MIX = PAGES.filter(([, p]) => !p.includes("page=40"));
const workers = Number(process.env.WORKERS ?? 20), dur = 20000, lat = [];
let errors = 0, done = 0;
const end = Date.now() + dur;
await Promise.all(Array.from({ length: workers }, async (_, w) => {
  let i = w;
  while (Date.now() < end) {
    const [who, path] = MIX[i++ % MIX.length];
    try { const r = await hit(who, path); if (r.status !== 200) errors++; lat.push(r.ms); done++; } catch { errors++; }
  }
}));
console.log(`\n== ${LABEL}: ${workers} concurrent users, 20 s ==`);
console.log(`requests ${done} (${(done / (dur / 1000)).toFixed(1)}/s)  errors ${errors}  p50 ${Math.round(pct(lat, 50))} ms  p95 ${Math.round(pct(lat, 95))} ms  p99 ${Math.round(pct(lat, 99))} ms  max ${Math.round(Math.max(...lat))} ms`);
const slow = rows.filter((r) => r.p50 > 500).sort((a, b) => b.p50 - a.p50);
console.log(`pages with p50 > 500 ms: ${slow.length}` + (slow.length ? "\n" + slow.map((r) => `  ${Math.round(r.p50)} ms ${r.path}`).join("\n") : ""));
