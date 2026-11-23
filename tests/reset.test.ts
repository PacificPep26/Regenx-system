import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run("password reset (db)", async () => {
  process.env.DATABASE_URL = url;
  delete process.env.RESEND_API_KEY;
  const { db } = await import("@/lib/db");
  const { requestReset, resetWithToken } = await import("@/app/actions/reset");
  const fd = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());
  let userId = "";

  beforeAll(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "PasswordReset","Notification","AuditLog","User","Store" CASCADE`);
    userId = (await db.user.create({ data: { email: "p@x.com", name: "P", role: "ADMIN", passwordHash: await bcrypt.hash("oldpassword1", 4) } })).id;
  });
  afterAll(() => db.$disconnect());

  it("answers identically for unknown and known emails, but only stores a request for the real one", async () => {
    const a = await requestReset(undefined, fd({ email: "nobody@x.com" }));
    const b = await requestReset(undefined, fd({ email: "p@x.com" }));
    expect(a).toEqual(b);
    expect(await db.passwordReset.count()).toBe(1);
    expect((await db.notification.findFirstOrThrow()).audience).toBe("ADMIN");
  });

  it("rejects bad tokens, accepts a valid one once, and revokes sessions", async () => {
    const bad = await resetWithToken(undefined, fd({ token: "x".repeat(30), password: "brandnewpass1", confirm: "brandnewpass1" }));
    expect(bad?.error).toMatch(/invalid or has expired/);

    const token = "t".repeat(43);
    await db.passwordReset.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
    expect((await resetWithToken(undefined, fd({ token, password: "short", confirm: "short" })))?.error).toMatch(/at least 10/);
    expect((await resetWithToken(undefined, fd({ token, password: "brandnewpass1", confirm: "different12" })))?.error).toMatch(/do not match/);

    const before = (await db.user.findUniqueOrThrow({ where: { id: userId } })).sessionVersion;
    expect((await resetWithToken(undefined, fd({ token, password: "brandnewpass1", confirm: "brandnewpass1" })))?.ok).toBeTruthy();
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare("brandnewpass1", u.passwordHash)).toBe(true);
    expect(u.sessionVersion).toBe(before + 1);
    expect((await resetWithToken(undefined, fd({ token, password: "anotherpass12", confirm: "anotherpass12" })))?.error).toMatch(/invalid or has expired/);
  });

  it("expired token is refused", async () => {
    const token = "e".repeat(43);
    await db.passwordReset.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() - 1000) } });
    expect((await resetWithToken(undefined, fd({ token, password: "brandnewpass2", confirm: "brandnewpass2" })))?.error).toMatch(/invalid or has expired/);
  });
});
