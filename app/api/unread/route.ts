import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { unreadCounts } from "@/lib/notify";
import { newOrderCounts } from "@/lib/newOrders";

export const dynamic = "force-dynamic";

/** Polled by the sidebar so badges and the toast stay live without a page reload. */
// shortcut: per-instance 4s cache so many open tabs polling every 8s cost one query set; use Redis when running several instances
const cache = new Map<string, { at: number; body: unknown }>();
const TTL = 4000;

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const hit = cache.get(u.id);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.body);
  if (cache.size > 5000) cache.clear();
  const fresh = await newOrderCounts(u);
  const body = { ...(await unreadCounts(u)), newOrders: Object.fromEntries(fresh) };
  cache.set(u.id, { at: Date.now(), body });
  return NextResponse.json(body);
}
