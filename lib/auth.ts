import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

export const currentUser = cache(async () => {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const user = await db.user.findUnique({ where: { id: s.uid }, include: { store: true } });
  // sessionVersion bump (password change / sign out everywhere) revokes old cookies
  if (!user || !user.active || user.sessionVersion !== s.v) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireRole(...roles: Role[]) {
  const u = await requireUser();
  if (!roles.includes(u.role)) notFound();
  return u;
}

export const isPartner = (u: CurrentUser) => u.role === "PARTNER_OWNER" || u.role === "PARTNER_STAFF";

/** The single gate for store-scoped data. Partners can only ever resolve their own store.
 * GP (FULFILLMENT) may view any store read-only, without money. */
export async function requireStore(slug: string) {
  const user = await requireUser();
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) notFound();
  if (isPartner(user) && user.storeId !== store.id) notFound();
  const isOps = user.role === "FULFILLMENT";
  const staffHidden = user.role === "PARTNER_STAFF" && store.hideAmountsFromStaff;
  // canSeePrices: prices and totals on orders/products (GP needs them). canSeeMoney: the store's account (deposit, ledger, statements).
  const canSeePrices = !staffHidden;
  const canSeeMoney = !isOps && !staffHidden;
  return { user, store, canSeeMoney, canSeePrices, canEdit: !isOps, isAdmin: user.role === "ADMIN" };
}

/** For server actions that receive a storeId from the client: verify instead of trusting it.
 * `ops: true` lets GP through (chat, saved views); everything else is partner/admin only. */
export async function requireStoreById(storeId: string, opts: { ops?: boolean } = {}) {
  const user = await requireUser();
  if (user.role === "FULFILLMENT" && !opts.ops) throw new Error("Forbidden");
  if (isPartner(user) && user.storeId !== storeId) throw new Error("Forbidden");
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  return { user, store, isAdmin: user.role === "ADMIN" };
}
