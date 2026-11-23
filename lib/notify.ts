import { Prisma, type Audience } from "@prisma/client";
import type { Tx } from "./db";
import { db } from "./db";
import type { CurrentUser } from "./auth";

export function notify(tx: Tx, n: { audience: Audience; storeId?: string | null; title: string; body?: string; link?: string }) {
  return tx.notification.create({ data: { ...n, storeId: n.storeId ?? null } });
}

/** Notifications visible to this user. */
export function notificationWhere(u: Pick<CurrentUser, "role" | "storeId">) {
  if (u.role === "ADMIN") return { audience: "ADMIN" as const };
  if (u.role === "FULFILLMENT") return { audience: "FULFILLMENT" as const };
  return { audience: "STORE" as const, storeId: u.storeId ?? "-" };
}

export type Unread = {
  notifications: number;
  chat: number;
  chatByStore: Record<string, number>;
  latest: { id: string; title: string; link: string | null } | null;
};

export async function unreadCounts(u: CurrentUser): Promise<Unread> {
  const where = notificationWhere(u);
  const scope = u.role === "ADMIN" || u.role === "FULFILLMENT" ? Prisma.empty : Prisma.sql`AND m."storeId" = ${u.storeId ?? "-"}`;
  const [notifications, latest, rows] = await Promise.all([
    db.notification.count({ where: { ...where, createdAt: { gt: u.notificationsSeenAt } } }),
    db.notification.findFirst({ where, orderBy: { createdAt: "desc" }, select: { id: true, title: true, link: true } }),
    // unread chat per store in ONE query (was one count query per store)
    db.$queryRaw<{ storeId: string; n: number }[]>`
      SELECT m."storeId", COUNT(*)::int AS n
      FROM "Message" m
      LEFT JOIN "ChatRead" r ON r."storeId" = m."storeId" AND r."userId" = ${u.id}
      WHERE m."authorId" <> ${u.id} AND m."createdAt" > COALESCE(r."lastReadAt", 'epoch'::timestamp) ${scope}
      GROUP BY m."storeId"`,
  ]);
  const chatByStore = Object.fromEntries(rows.map((r) => [r.storeId, r.n]));
  return { notifications, chat: rows.reduce((a, r) => a + r.n, 0), chatByStore, latest };
}
