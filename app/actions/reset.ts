"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";

export type ResetState = { error?: string; ok?: string } | undefined;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const TTL_MS = 60 * 60 * 1000;

// shortcut: in-memory throttle per instance; move to DB/Redis when running >1 instance
const recent = new Map<string, number>();

/** Always answers the same way so the form cannot be used to discover which emails exist. */
export async function requestReset(_: ResetState, form: FormData): Promise<ResetState> {
  const p = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!p.success) return { error: "Enter a valid email." };
  const generic: ResetState = { ok: "If that account exists, a reset request was sent. Your administrator will contact you, or you will get an email with a link." };

  const last = recent.get(p.data) ?? 0;
  if (Date.now() - last < 60_000) return generic;
  recent.set(p.data, Date.now());

  const user = await db.user.findUnique({ where: { email: p.data }, include: { store: true } });
  if (!user || !user.active) return generic;

  const token = randomBytes(32).toString("base64url");
  await db.$transaction(async (tx) => {
    await tx.passwordReset.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL_MS) } });
    await notify(tx, {
      audience: "ADMIN",
      storeId: user.storeId,
      title: `Password reset requested: ${user.email}`,
      body: user.store?.name,
      link: "/users?q=" + encodeURIComponent(user.email),
    });
    await audit(tx, user.id, "password.reset_requested", "User", user.id);
  });

  const key = process.env.RESEND_API_KEY;
  if (key) {
    const h = await headers();
    const base = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.STATEMENT_FROM_EMAIL,
        to: [user.email],
        subject: "Reset your RegenX password",
        html: `<p>Use this link within 1 hour to choose a new password:</p><p><a href="${base}/reset-password?token=${token}">Reset password</a></p><p>If you did not ask for this, ignore this email.</p>`,
      }),
    }).catch((e) => console.error("reset email failed", e));
  }
  return generic;
}

export async function resetWithToken(_: ResetState, form: FormData): Promise<ResetState> {
  const p = z
    .object({ token: z.string().min(20), password: z.string().min(10, "Password must be at least 10 characters"), confirm: z.string() })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  if (p.data.password !== p.data.confirm) return { error: "Passwords do not match." };

  const row = await db.passwordReset.findUnique({ where: { tokenHash: hash(p.data.token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.active) return { error: "This reset link is invalid or has expired. Request a new one." };

  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(p.data.password, 10), sessionVersion: { increment: 1 } } }),
    db.passwordReset.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } }),
    db.auditLog.create({ data: { actorId: row.userId, action: "password.reset_done", entity: "User", entityId: row.userId } }),
  ]);
  return { ok: "Password updated. You can sign in now." };
}
