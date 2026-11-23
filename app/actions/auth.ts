"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { requireUser } from "@/lib/auth";

const REMEMBER_SEC = 60 * 60 * 24 * 30;
const SHORT_SEC = 60 * 60 * 12;

// shortcut: in-memory throttle, per server instance; move to Redis/DB when running >1 instance
const fails = new Map<string, { n: number; until: number }>();

export type FormState = { error?: string; ok?: string } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(1), remember: z.string().optional(), next: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const email = parsed.data.email.toLowerCase().trim();

  const f = fails.get(email);
  if (f && f.n >= 5 && f.until > Date.now()) return { error: "Too many attempts. Try again in 15 minutes." };

  const user = await db.user.findUnique({ where: { email } });
  const valid = user?.active && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!user || !valid) {
    const n = (f && f.until > Date.now() ? f.n : 0) + 1;
    fails.set(email, { n, until: Date.now() + 15 * 60 * 1000 });
    return { error: "Invalid email or password." };
  }
  fails.delete(email);

  const remember = parsed.data.remember === "on";
  const token = await signSession({ uid: user.id, v: user.sessionVersion }, remember ? REMEMBER_SEC : SHORT_SEC);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_SEC } : {}),
  });
  const next = parsed.data.next;
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function logoutEverywhere() {
  const u = await requireUser();
  await db.user.update({ where: { id: u.id }, data: { sessionVersion: { increment: 1 } } });
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const u = await requireUser();
  const p = z
    .object({ current: z.string(), next: z.string().min(10, "New password must be at least 10 characters") })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!(await bcrypt.compare(p.data.current, u.passwordHash))) return { error: "Current password is wrong." };
  const updated = await db.user.update({
    where: { id: u.id },
    data: { passwordHash: await bcrypt.hash(p.data.next, 10), sessionVersion: { increment: 1 } },
  });
  // keep this device signed in with the new version
  const token = await signSession({ uid: u.id, v: updated.sessionVersion }, REMEMBER_SEC);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: REMEMBER_SEC });
  return { ok: "Password changed. Other devices were signed out." };
}
