import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, Download, History } from "lucide-react";
import { db } from "@/lib/db";
import { getBalances } from "@/lib/balances";
import { requireStore } from "@/lib/auth";
import { flat, pageOf, str, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { StockRowActions } from "@/components/StockRowActions";
import { effectiveMinimum } from "@/lib/storeStock";
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
  const { page, skip, take } = pageOf(sp, 20); // 20 products (groups) per page
  const base = `/s/${slug}/inventory`;
  const stockWhere = { storeId: store.id, OR: [{ onHand: { not: 0 } }, { reserved: { not: 0 } }] };
  const where = { ...stockWhere, ...(q ? { product: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }] } } : {}) };
  const [rows, totals, orders] = await Promise.all([
    // a store has at most a few hundred stocked SKUs: fetch them all and group by product name below
    db.storeStock.findMany({ where, orderBy: [{ product: { name: "asc" } }, { product: { strength: "asc" } }], take: 1000, include: { product: { select: { name: true, strength: true, sku: true } } } }),
    db.storeStock.aggregate({ where: stockWhere, _count: true, _sum: { onHand: true, reserved: true } }),
    db.inventoryOrder.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 10, include: { _count: { select: { items: true } } } }),
  ]);
  // one line per product name; the sizes (5mg, 10mg...) fold inside it
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.product.name.trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const allGroups = [...groups.values()];
  const pageGroups = allGroups.slice(skip, skip + take);
  const bal = await getBalances(store.id);
  const onHand = totals._sum.onHand ?? 0;
  const reserved = totals._sum.reserved ?? 0;
  const owner = user.role === "PARTNER_OWNER" || isAdmin;
  return (
    <div className="space-y-5">
      <PageHeader title="Inventory" />
      {canEdit && <AddInventoryPanel storeId={store.id} slug={slug} discountBps={store.discountBps} creditCents={bal.CREDIT} defaultOpen={str(sp, "add") === "1"} className="btn-primary w-full sm:w-auto" />}

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
        {allGroups.length ? (
          <>
            <ul className="divide-y divide-line border border-line">
              {pageGroups.map((g) => {
                const avail = g.reduce((n, r) => n + r.onHand - r.reserved, 0);
                const out = g.some((r) => r.onHand - r.reserved <= 0);
                const low = g.some((r) => r.onHand - r.reserved <= effectiveMinimum(r.reorderLevel));
                return (
                  <li key={g[0].product.name}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm hover:bg-hover [&::-webkit-details-marker]:hidden">
                        <ChevronDown size={14} className="shrink-0 -rotate-90 text-gray-400 transition-transform group-open:rotate-0" />
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {g[0].product.name}
                          {g.length === 1 && <span className="font-normal text-gray-500"> {g[0].product.strength}</span>}
                        </span>
                        {g.length > 1 && <span className="shrink-0 text-xs text-gray-400">{g.length} sizes</span>}
                        {out ? <span className="shrink-0 border border-red px-1 text-[10px] font-bold uppercase text-red">out</span> : low ? <span className="shrink-0 border border-warn px-1 text-[10px] font-bold uppercase text-warn">low</span> : null}
                        <b className="w-10 shrink-0 text-right text-base tabular-nums text-navy">{avail}</b>
                      </summary>
                      <ul className="divide-y divide-line border-t border-line bg-soft">
                        {g.map((r) => {
                          const available = r.onHand - r.reserved;
                          return (
                            <li key={r.productId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 pl-8 text-sm">
                              <span className="min-w-0">
                                <b>{r.product.strength}</b>
                                <span className="block break-all text-[11px] text-gray-400">{r.product.sku}</span>
                              </span>
                              <span className="tabular-nums text-xs text-gray-600">
                                <b className="text-sm text-navy">{available}</b> available · {r.onHand} on hand{r.reserved ? ` · ${r.reserved} reserved` : ""}
                              </span>
                              {owner && <StockRowActions storeId={store.id} productId={r.productId} name={`${r.product.name} ${r.product.strength}`} minimum={effectiveMinimum(r.reorderLevel)} custom={r.reorderLevel > 0} canAdjust={isAdmin} canSetMinimum={owner} />}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
            <Pager page={page} pages={Math.ceil(allGroups.length / take)} params={flat(sp)} />
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
                <Link href={`${base}/orders/${o.id}`} className="grid grid-cols-[1fr_5.5rem_4.5rem] items-center gap-2 p-3 text-sm hover:bg-hover">
                  <span className="min-w-0 truncate"><b className="text-navy">#{o.number}</b> · {o._count.items} items<span className="hidden sm:inline"> · {fmtDate(o.createdAt)}</span></span>
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
