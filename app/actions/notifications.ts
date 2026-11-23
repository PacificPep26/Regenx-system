"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notificationWhere } from "@/lib/notify";

export type NotificationItem = { id: string; title: string; body: string | null; link: string | null; at: string; fresh: boolean; store: string | null };

/** Latest notifications for the bell panel; opening the panel marks them seen. */
export async function openNotifications(): Promise<NotificationItem[]> {
  const u = await requireUser();
  const rows = await db.notification.findMany({
    where: notificationWhere(u),
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { store: { select: { name: true } } },
  });
  await db.user.update({ where: { id: u.id }, data: { notificationsSeenAt: new Date() } });
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    link: n.link,
    at: n.createdAt.toISOString(),
    fresh: n.createdAt > u.notificationsSeenAt,
    store: u.role === "ADMIN" || u.role === "FULFILLMENT" ? (n.store?.name ?? null) : null,
  }));
}
