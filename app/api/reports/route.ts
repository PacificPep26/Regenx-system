import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser, isPartner } from "@/lib/auth";
import { defaultRange, salesByPeriod, type Unit } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** CSV of the daily/monthly report. Admin: any store (or all). Partner: only their own store, and only if they may see money. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || u.role === "FULFILLMENT") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const p = new URL(req.url).searchParams;
  const unit: Unit = p.get("by") === "month" ? "month" : "day";
  let storeId = p.get("store") || undefined;
  if (isPartner(u)) {
    const s = await db.store.findUnique({ where: { id: u.storeId ?? "-" }, select: { id: true, hideAmountsFromStaff: true } });
    if (!s || (u.role === "PARTNER_STAFF" && s.hideAmountsFromStaff)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    storeId = s.id; // never trust the client's store id for partners
  }
  const def = defaultRange(unit);
  const day = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);
  const from = day(p.get("from")) ?? def.from;
  const to = day(p.get("to")) ? new Date(day(p.get("to"))!.getTime() + 86400000) : def.to;
  const rows = await salesByPeriod(unit, from, to, { storeId, storeQ: u.role === "ADMIN" ? (p.get("storeQ") ?? undefined) : undefined });
  const fmt = (d: Date) => d.toISOString().slice(0, unit === "day" ? 10 : 7);
  const lines = rows.map((r) => [fmt(r.period), r.orders, r.units, (r.wholesale / 100).toFixed(2), (r.shipping / 100).toFixed(2)].join(","));
  return new NextResponse("﻿" + [`${unit},orders,units,wholesale_usd,shipping_usd`, ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sales-by-${unit}.csv"` },
  });
}
