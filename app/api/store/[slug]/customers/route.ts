import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, isPartner } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Customer lookup for the order form: top matches only (recent customers when there is no search text). */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const u = await currentUser();
  if (!u || u.role === "FULFILLMENT") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const store = await db.store.findUnique({ where: { slug: (await ctx.params).slug }, select: { id: true } });
  if (!store || (isPartner(u) && u.storeId !== store.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80);
  const c = q ? { contains: q, mode: "insensitive" as const } : null;
  const items = await db.customer.findMany({
    where: { storeId: store.id, ...(c ? { OR: [{ name: c }, { email: c }, { phone: c }, { company: c }, { city: c }] } : {}) },
    orderBy: c ? { name: "asc" } : { createdAt: "desc" },
    take: 15,
    select: { id: true, name: true, email: true, city: true, region: true },
  });
  return NextResponse.json({ items });
}
