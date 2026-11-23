import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateApi, serializeOrder, ORDER_INCLUDE } from "@/lib/apiKeys";

export const dynamic = "force-dynamic";

/** GET /api/v1/orders/:id : status and tracking of one of the key's own orders. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authenticateApi(req);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  const o = await db.order.findFirst({ where: { id: (await ctx.params).id, storeId: a.store.id }, include: ORDER_INCLUDE });
  if (!o) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  return NextResponse.json({ order: serializeOrder(o) });
}
