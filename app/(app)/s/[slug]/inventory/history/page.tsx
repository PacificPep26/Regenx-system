import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { Prisma, StoreStockType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { str, list, dateRange, pageOf, flat, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { Empty, PageHeader, Pager } from "@/components/ui";

const TYPES: StoreStockType[] = ["RECEIPT", "RESERVE", "RELEASE", "SHIP", "ADJUST"];
const LABEL: Record<StoreStockType, string> = { RECEIPT: "Stocked", RESERVE: "Reserved", RELEASE: "Released", SHIP: "Shipped", ADJUST: "Adjusted" };
const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Every change to the store's own stock, newest first: why the numbers are what they are. */
export default async function InventoryHistory({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { store } = await requireStore(slug);
  if (!store.inventoryMode) notFound();
  const q = str(sp, "q");
  const types = list(sp, "type", TYPES);
  const range = dateRange(sp, "from", "to");
  const productIds = q
    ? (await db.product.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] }, select: { id: true }, take: 200 })).map((p) => p.id)
    : undefined;
  const where: Prisma.StoreStockMovementWhereInput = {
    storeId: store.id,
    ...(productIds ? { productId: { in: productIds } } : {}),
    ...(types ? { type: { in: types } } : {}),
    ...(range ? { createdAt: range } : {}),
  };
  const { page, skip, take } = pageOf(sp, 30);
  const [rows, count] = await Promise.all([db.storeStockMovement.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }), db.storeStockMovement.count({ where })]);
  const [products, orders, invs] = await Promise.all([
    db.product.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.productId))] } }, select: { id: true, name: true, strength: true, sku: true } }),
    db.order.findMany({ where: { id: { in: rows.map((r) => r.orderId).filter((x): x is string => !!x) } }, select: { id: true, number: true } }),
    db.inventoryOrder.findMany({ where: { id: { in: rows.map((r) => r.inventoryOrderId).filter((x): x is string => !!x) } }, select: { id: true, number: true } }),
  ]);
  const prod = new Map(products.map((p) => [p.id, p]));
  const ord = new Map(orders.map((o) => [o.id, o.number]));
  const inv = new Map(invs.map((o) => [o.id, o.number]));
  const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const base = `/s/${slug}`;

  return (
    <div className="space-y-3">
      <div className="text-sm"><Link href={`${base}/inventory`} className="text-navy"><ChevronLeft size={16} className="inline -mt-0.5" />Inventory</Link></div>
      <PageHeader title="Inventory history" />
      <FilterBar
        fields={[
          { type: "search", key: "q", placeholder: "Search product or SKU…" },
          { type: "multi", key: "type", label: "Type", options: TYPES.map((t) => ({ value: t, label: LABEL[t] })) },
          { type: "date", from: "from", to: "to", label: "Date" },
        ]}
      />
      {!rows.length ? (
        <Empty>No movements.</Empty>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {rows.map((m) => {
            const p = prod.get(m.productId);
            const delta = m.onHandDelta || m.reservedDelta;
            const link = m.orderId ? { href: `${base}/orders/${m.orderId}`, label: `Customer order #${ord.get(m.orderId) ?? ""}` } : m.inventoryOrderId ? { href: `${base}/inventory/orders/${m.inventoryOrderId}`, label: `Inventory #${inv.get(m.inventoryOrderId) ?? ""}` } : null;
            return (
              <li key={m.id} className="grid grid-cols-[1fr_4.5rem] items-start gap-2 p-3 text-sm md:grid-cols-[9rem_1fr_6rem_4.5rem]">
                <span className="col-span-2 text-xs text-gray-500 md:col-span-1">{when(m.createdAt)}</span>
                <span className="min-w-0">
                  <b>{p?.name}</b> <span className="text-gray-500">{p?.strength}</span>
                  <span className="block text-xs text-gray-500">
                    {link && <Link href={link.href} className="text-navy underline">{link.label}</Link>} {m.memo}
                  </span>
                </span>
                <span className="hidden text-xs font-semibold uppercase md:block">{LABEL[m.type]}</span>
                <span className={`justify-self-end text-right font-bold tabular-nums ${m.onHandDelta > 0 ? "text-ok" : m.onHandDelta < 0 ? "text-red" : "text-gray-600"}`}>
                  <span className="mr-2 text-xs font-semibold uppercase md:hidden">{LABEL[m.type]}</span>
                  {sign(delta)}
                  {m.onHandDelta === 0 && m.reservedDelta !== 0 && <span className="block text-[10px] font-normal text-gray-400">reserved</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
    </div>
  );
}
