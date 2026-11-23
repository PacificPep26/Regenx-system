// Dev tool: counts SQL statements per page using Postgres' own log (DB must have log_min_duration_statement=0 and be named *_scale).
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
const base = process.argv[2] ?? "http://localhost:3200";
const db = new PrismaClient();
const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const tok = async (email) => { const u = await db.user.findUniqueOrThrow({ where: { email } }); return "rx_session=" + await new SignJWT({ uid: u.id, v: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(key); };
const ck = { admin: await tok("admin@scale.local"), owner: await tok("owner1@scale.local"), gp: await tok("gp@scale.local") };
await db.$disconnect();
const logs = () => execSync("docker compose logs db --no-log-prefix --tail 4000", { encoding: "utf8", maxBuffer: 1 << 28 });
const execs = (s) => (s.match(/duration: [\d.]+ ms\s+(execute|statement|parse)/g) ?? []).length;
for (const [who, path] of [["admin", "/api/unread"], ["owner", "/api/unread"], ["admin", "/overview"], ["admin", "/gp"], ["admin", "/s/s001/dashboard"], ["admin", "/s/s001/orders"], ["admin", "/customers"], ["owner", "/s/s001/dashboard"], ["owner", "/s/s001/orders"], ["gp", "/gp"], ["admin", "/stock"]]) {
  await fetch(base + path, { headers: { cookie: ck[who] } });
  await new Promise((r) => setTimeout(r, 500));
  const before = execs(logs());
  await fetch(base + path, { headers: { cookie: ck[who] } });
  await new Promise((r) => setTimeout(r, 600));
  console.log(String(execs(logs()) - before).padStart(4), "statements", who.padEnd(5), path);
}
