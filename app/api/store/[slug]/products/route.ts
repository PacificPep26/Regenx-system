import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser, isPartner } from "@/lib/auth";
import { popularProducts, stockFlagsFor } from "@/lib/pickers";

export const dynamic = "force-dynamic";
const SIZE = 30;
const SELECT = { id: true, sku: true, sourceCode: true, name: true, strength: true, basePriceCents: true } as const;

/** Server-side product search for the order picker: one page at a time, so the catalog size never reaches the browser. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const u = await currentUser();
  if (!u || u.role === "FULFILLMENT") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const store = await db.store.findUnique({ where: { slug: (await ctx.params).slug } });
  if (!store || (isPartner(u) && u.storeId !== store.id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 80);
  const page = Math.max(0, Math.floor(Number(url.searchParams.get("page"))) || 0);
  const base: Prisma.ProductWhereInput = { active: true, ...(store.allowRestricted ? {} : { restricted: false }) };

  // with no search text the first page leads with this store's most-ordered products
  const hits = await popularProducts(store.id);
  const topIds = !q && page === 0 ? Object.entries(hits).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id) : [];
  const popular = topIds.length ? await db.product.findMany({ where: { ...base, id: { in: topIds } }, select: SELECT }) : [];
  popular.sort((a, b) => (hits[b.id] ?? 0) - (hits[a.id] ?? 0));

  const where: Prisma.ProductWhereInput = {
    ...base,
    ...(topIds.length ? { id: { notIn: topIds } } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { sourceCode: { contains: q, mode: "insensitive" } }, { strength: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const rows = await db.product.findMany({ where, orderBy: [{ name: "asc" }, { basePriceCents: "asc" }], skip: page * SIZE, take: SIZE + 1, select: SELECT });
  const items = rows.slice(0, SIZE);
  const flags = await stockFlagsFor([...popular, ...items].map((p) => p.id));
  const tag = (p: (typeof items)[number]) => ({ ...p, hits: hits[p.id] ?? 0, flag: flags[p.id] ?? null });
  return NextResponse.json({ popular: popular.map(tag), items: items.map(tag), hasMore: rows.length > SIZE });
}
