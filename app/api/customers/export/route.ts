import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { customerWhere } from "@/lib/customerQuery";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Admin-only CSV of customers matching the same filters as the page. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await db.customer.findMany({
    where: customerWhere(sp),
    orderBy: { createdAt: "desc" },
    take: 50000,
    include: { store: { select: { name: true } }, orders: { where: { status: { notIn: ["DRAFT", "CANCELLED"] } }, select: { totalCents: true, createdAt: true } } },
  });
  const head = ["store", "name", "company", "email", "phone", "address1", "address2", "city", "state", "zip", "country", "tags", "notes", "orders", "wholesale_usd", "last_order", "added"];
  const lines = rows.map((c) => {
    const total = c.orders.reduce((s, o) => s + o.totalCents, 0);
    const last = c.orders.reduce<Date | null>((m, o) => (!m || o.createdAt > m ? o.createdAt : m), null);
    return [c.store.name, c.name, c.company, c.email, c.phone, c.line1, c.line2, c.city, c.region, c.postalCode, c.country, c.tags.join(";"), c.notes, c.orders.length, (total / 100).toFixed(2), last?.toISOString().slice(0, 10), c.createdAt.toISOString().slice(0, 10)].map(esc).join(",");
  });
  return new NextResponse("﻿" + [head.join(","), ...lines].join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
