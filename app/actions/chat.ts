"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStoreById, requireUser, isPartner } from "@/lib/auth";
import { notify } from "@/lib/notify";

export type ChatMessage = { id: string; body: string; at: string; author: string; mine: boolean; side: "store" | "admin" | "gp"; orderNumber: number | null; orderId: string | null };

export async function fetchMessages(storeId: string, after?: string): Promise<ChatMessage[]> {
  const { user } = await requireStoreById(storeId, { ops: true });
  const rows = await db.message.findMany({
    // gte (+ client dedupe) so messages sharing the same millisecond are not skipped
    where: { storeId, ...(after ? { createdAt: { gte: new Date(after) } } : {}) },
    orderBy: { createdAt: after ? "asc" : "desc" },
    take: after ? 100 : 60,
    include: { author: { select: { name: true, role: true } }, order: { select: { number: true } } },
  });
  if (!after) rows.reverse();
  if (rows.length && (!after || rows[rows.length - 1].createdAt > new Date(after)))
    await db.chatRead.upsert({
      where: { userId_storeId: { userId: user.id, storeId } },
      create: { userId: user.id, storeId, lastReadAt: rows[rows.length - 1].createdAt },
      update: { lastReadAt: rows[rows.length - 1].createdAt },
    });
  return rows.map((m) => ({
    id: m.id,
    body: m.body,
    at: m.createdAt.toISOString(),
    author: m.author.name,
    mine: m.authorId === user.id,
    side: (m.author.role === "ADMIN" ? "admin" : m.author.role === "FULFILLMENT" ? "gp" : "store") as ChatMessage["side"],
    orderNumber: m.order?.number ?? null,
    orderId: m.orderId,
  }));
}

export async function sendMessage(storeId: string, body: string, orderId?: string) {
  const { user, store } = await requireStoreById(storeId, { ops: true });
  const text = z.string().trim().min(1).max(4000).parse(body);
  if (orderId) {
    const ok = await db.order.count({ where: { id: orderId, storeId } });
    if (!ok) throw new Error("Order not in this store");
  }
  await db.$transaction(async (tx) => {
    await tx.message.create({ data: { storeId, authorId: user.id, body: text, orderId: orderId ?? null } });
    // ping the other side(s)
    const n = { storeId, body: text.slice(0, 140), link: `/s/${store.slug}/chat` };
    if (isPartner(user)) {
      await notify(tx, { ...n, audience: "ADMIN", title: `Message from ${store.name}` });
      await notify(tx, { ...n, audience: "FULFILLMENT", title: `Message from ${store.name}` });
    } else {
      await notify(tx, { ...n, audience: "STORE", title: user.role === "FULFILLMENT" ? "New message from GP Fulfillment" : "New message from RegenX" });
    }
  });
}

export async function markOrdersSeen(storeId: string) {
  const { user } = await requireStoreById(storeId, { ops: true });
  const now = new Date();
  await db.storeSeen.upsert({
    where: { userId_storeId: { userId: user.id, storeId } },
    create: { userId: user.id, storeId, ordersSeenAt: now },
    update: { ordersSeenAt: now },
  });
}

export async function markNotificationsSeen() {
  const u = await requireUser();
  await db.user.update({ where: { id: u.id }, data: { notificationsSeenAt: new Date() } });
  revalidatePath("/", "layout");
}
