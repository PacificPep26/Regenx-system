import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, History } from "lucide-react";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { flat, pageOf, str, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { StockRowActions } from "@/components/StockRowActions";
import { AddInventoryPanel } from "@/components/AddInventoryPanel";
import { invBadge } from "@/lib/inventoryLabels";
import { Badge, Empty, Money, PageHeader, Pager, fmtDate } from "@/components/ui";

/** The store's own stock at GP, plus its inventory orders. */
export default async function InventoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { user, store, canEdit, canSeePrices, isAdmin } = await requireStore(slug);
  if (!store.inventoryMode) notFound();
  const q = str(sp, "q");
  const { page, skip, take } = pageOf(sp, 25);
  const base = `/s/${slug}/inventory`;
  const stockWhere = { storeId: store.id, OR: [{ onHand: { not: 0 } }, { reserved: { not: 0 } }] };
  const where = { ...stockWhere, ...(q ? { product: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }] } } : {}) };
  const [rows, count, totals, orders] = await Promise.all([
    db.storeStock.findMany({ where, orderBy: { product: { name: "asc" } }, skip, take, include: { product: { select: { name: true, strength: true, sku: true } } } }),
    db.storeStock.count({ where }),
    db.storeStock.aggregate({ where: stockWhere, _count: true, _sum: { onHand: true, reserved: true } }),
    db.inventoryOrder.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 10, include: { _count: { select: { items: true } } } }),
  ]);
  const onHand = totals._sum.onHand ?? 0;
  const reserved = totals._sum.reserved ?? 0;
  const owner = user.role === "PARTNER_OWNER" || isAdmin;
  return (
    <div className="space-y-5">
      <PageHeader title="Inventory" />
      {canEdit && <AddInventoryPanel storeId={store.id} slug={slug} discountBps={store.discountBps} defaultOpen={str(sp, "add") === "1"} />}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {([["Products", totals._count], ["On hand", onHand], ["Reserved", reserved], ["Available", onHand - reserved]] as const).map(([l, n]) => (
          <div key={l} className="panel border-t-4 border-t-navy p-3 text-center"><div className="text-xl font-bold tabular-nums">{n}</div><div className="label mb-0">{l}</div></div>
        ))}
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="label mb-0">Your stock at GP</h2>
          <span className="flex gap-2">
            <Link href={`${base}/history`} className="btn h-8 text-xs"><History size={14} /> History</Link>
            <a href={`/api/store/${slug}/inventory/export`} className="btn h-8 text-xs"><Download size={14} /> Export CSV</a>
          </span>
        </div>
        <FilterBar fields={[{ type: "search", key: "q", placeholder: "Search product or SKU…" }]} />
        {rows.length ? (
          <>
            <ul className="divide-y divide-line border border-line">
              {rows.map((r) => {
                const available = r.onHand - r.reserved;
                const low = r.reorderLevel > 0 && available <= r.reorderLevel;
                return (
                  <li key={r.productId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <b>{r.product.name}</b> <span className="text-gray-500">{r.product.strength}</span> <span className="text-xs text-gray-400">{r.product.sku}</span>
                      {available <= 0 ? <span className="ml-1 border border-red px-1 text-[10px] font-bold uppercase text-red">out</span> : low ? <span className="ml-1 border border-warn px-1 text-[10px] font-bold uppercase text-warn">low</span> : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs">
                      <b className="text-base text-navy">{available}</b> available · {r.onHand} on hand{r.reserved ? ` · ${r.reserved} reserved` : ""}
                    </span>
                    {owner && <StockRowActions storeId={store.id} productId={r.productId} name={`${r.product.name} ${r.product.strength}`} minimum={r.reorderLevel} canAdjust={isAdmin} canSetMinimum={owner} />}
                  </li>
                );
              })}
            </ul>
            <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
          </>
        ) : (
          <Empty>{q ? "No match." : "No stock yet. Add inventory, then GP stocks it for you."}</Empty>
        )}
      </section>

      <section>
        <h2 className="label mb-2">Inventory orders</h2>
        {orders.length ? (
          <ul className="divide-y divide-line border border-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`${base}/orders/${o.id}`} className="grid grid-cols-[1fr_6.5rem_5rem] items-center gap-2 p-3 text-sm hover:bg-hover">
                  <span className="min-w-0 truncate"><b className="text-navy">#{o.number}</b> · {o._count.items} product(s) · {fmtDate(o.createdAt)}</span>
                  <span className="justify-self-end"><Badge value={invBadge(o.status)} /></span>
                  <span className="justify-self-end">{canSeePrices && o.status !== "DRAFT" ? <Money cents={o.totalCents} /> : null}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No inventory orders yet.</Empty>
        )}
      </section>
    </div>
  );
}
