import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, isPartner } from "@/lib/auth";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of the store's own stock (scoped to the signed-in partner's store, or any store for admin/GP). */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const store = await db.store.findUnique({ where: { slug: (await ctx.params).slug } });
  if (!store || (isPartner(u) && u.storeId !== store.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rows = await db.storeStock.findMany({
    where: { storeId: store.id, OR: [{ onHand: { not: 0 } }, { reserved: { not: 0 } }] },
    orderBy: { product: { name: "asc" } },
    take: 50000,
    include: { product: { select: { sku: true, name: true, strength: true } } },
  });
  const head = ["sku", "product", "strength", "on_hand", "reserved", "available", "minimum"];
  const lines = rows.map((r) => [r.product.sku, r.product.name, r.product.strength, r.onHand, r.reserved, r.onHand - r.reserved, r.reorderLevel].map(esc).join(","));
  return new NextResponse("﻿" + [head.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="inventory-${store.slug}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
