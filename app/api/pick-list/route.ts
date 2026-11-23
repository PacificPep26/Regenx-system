import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Complete pick list (every SKU needed by open orders) for the warehouse; the dashboard only shows the top rows. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || (u.role !== "ADMIN" && u.role !== "FULFILLMENT")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const store = new URL(req.url).searchParams.get("store")?.trim();
  const orderWhere = {
    status: { in: ["APPROVED", "PACKING"] as ("APPROVED" | "PACKING")[] },
    ...(store ? { store: { OR: [{ slug: { contains: store, mode: "insensitive" as const } }, { name: { contains: store, mode: "insensitive" as const } }] } } : {}),
  };
  const groups = await db.orderItem.groupBy({ by: ["productId"], where: { order: orderWhere }, _sum: { qty: true }, _count: { orderId: true }, orderBy: { _sum: { qty: "desc" } } });
  const products = await db.product.findMany({ where: { id: { in: groups.map((g) => g.productId) } }, select: { id: true, sku: true, sourceCode: true, upc: true, name: true, strength: true } });
  const pm = new Map(products.map((p) => [p.id, p]));
  const lines = groups.map((g) => {
    const p = pm.get(g.productId);
    return [p?.sku, p?.sourceCode, p?.upc, p?.name, p?.strength, g._count.orderId, g._sum.qty ?? 0].map(esc).join(",");
  });
  return new NextResponse("﻿" + ["sku,source_code,upc,product,strength,orders,units", ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="pick-list-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
