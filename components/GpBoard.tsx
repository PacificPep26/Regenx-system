import Link from "next/link";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { str, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { PrintButton } from "@/components/PrintButton";
import { Badge, Money, PageHeader } from "@/components/ui";

export const GP_FEE_PER_UNIT_CENTS = 1000; // what GP earns per unit packed and shipped ($10)
const OPEN = ["APPROVED", "PACKING"] as const;
const H = 3600_000;
const TOP = 15; // every list is a bounded "top N" computed in SQL, with a link/export for the full set

type Alert = { id: string; name: string; strength: string; sku: string; onHand: number; reserved: number; reorderLevel: number };

/** GP manager view: workload, aging/SLA, SKU pick totals and per-store order inventory. No money. */
export async function GpBoard({ searchParams, embedded = false }: { searchParams: Promise<SP>; embedded?: boolean }) {
  await requireRole("ADMIN", "FULFILLMENT");
  const sp = await searchParams;
  const storeQ = str(sp, "store");
  const storeFilter = storeQ ? { store: { OR: [{ slug: { contains: storeQ, mode: "insensitive" as const } }, { name: { contains: storeQ, mode: "insensitive" as const } }] } } : {};
  const now = Date.now();
  const dayStart = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }) + "T00:00:00-05:00");
  const nyDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const monthStart = new Date(nyDate.slice(0, 8) + "01T00:00:00-05:00");
  const weekStart = new Date(now - 7 * 24 * 3600_000);
  const units = async (from: Date) => (await db.orderItem.aggregate({ where: { order: { status: { in: ["SHIPPED", "DELIVERED"] }, shippedAt: { gte: from }, ...storeFilter } }, _sum: { qty: true } }))._sum.qty ?? 0;
  const [uToday, uWeek, uMonth] = await Promise.all([units(dayStart), units(weekStart), units(monthStart)]);
  const open = { status: { in: [...OPEN] }, ...storeFilter };

  const [byStatus, shippedToday, warn, late, queue, stuckCount, stuck, topStores, pick, pickTotal, alertCount, alerts] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: open, _count: true }),
    db.order.count({ where: { shippedAt: { gte: dayStart }, ...storeFilter } }),
    db.order.count({ where: { ...open, approvedAt: { lte: new Date(now - 24 * H), gt: new Date(now - 48 * H) } } }),
    db.order.count({ where: { ...open, approvedAt: { lte: new Date(now - 48 * H) } } }),
    db.order.findMany({
      where: open,
      // priority support: Premium stores first, then oldest first
      orderBy: [{ store: { tier: "desc" } }, { approvedAt: "asc" }],
      take: TOP,
      select: { id: true, number: true, status: true, approvedAt: true, shipRegion: true, store: { select: { name: true, tier: true } }, _count: { select: { items: true } } },
    }),
    db.order.count({ where: { status: "SHIPPED", shippedAt: { lt: new Date(now - 10 * 24 * H) }, ...storeFilter } }),
    db.order.findMany({ where: { status: "SHIPPED", shippedAt: { lt: new Date(now - 10 * 24 * H) }, ...storeFilter }, orderBy: { shippedAt: "asc" }, take: 8, select: { id: true, number: true, carrier: true, trackingNo: true, store: { select: { name: true } } } }),
    // stores with the most open work first
    db.order.groupBy({ by: ["storeId"], where: open, _count: true, orderBy: { _count: { storeId: "desc" } }, take: 12 }),
    db.orderItem.groupBy({ by: ["productId"], where: { order: open }, _sum: { qty: true }, _count: { orderId: true }, orderBy: { _sum: { qty: "desc" } }, take: TOP }),
    db.orderItem.aggregate({ where: { order: open }, _sum: { qty: true } }),
    db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Product" WHERE "trackStock" AND active AND ("onHand" - "reserved") <= "reorderLevel"`,
    db.$queryRaw<Alert[]>`SELECT id, name, strength, sku, "onHand", "reserved", "reorderLevel" FROM "Product" WHERE "trackStock" AND active AND ("onHand" - "reserved") <= "reorderLevel" ORDER BY ("onHand" - "reserved") ASC LIMIT 8`,
  ]);

  const [products, matrixRows, storeNames] = await Promise.all([
    db.product.findMany({ where: { id: { in: pick.map((p) => p.productId) } }, select: { id: true, sku: true, sourceCode: true, name: true, strength: true } }),
    db.order.groupBy({ by: ["storeId", "status"], where: { status: { not: "DRAFT" }, storeId: { in: topStores.map((s) => s.storeId) } }, _count: true }),
    db.store.findMany({ where: { id: { in: topStores.map((s) => s.storeId) } }, select: { id: true, slug: true, name: true } }),
  ]);
  const pmap = new Map(products.map((p) => [p.id, p]));
  const pickRows = pick.map((p) => ({ ...pmap.get(p.productId)!, qty: p._sum.qty ?? 0, orders: p._count.orderId }));
  const sname = new Map(storeNames.map((s) => [s.id, s]));
  const statuses = ["ON_HOLD", "APPROVED", "PACKING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
  const matrix = new Map<string, Record<string, number>>();
  for (const g of matrixRows) matrix.set(g.storeId, { ...(matrix.get(g.storeId) ?? {}), [g.status]: g._count });

  const cnt = Object.fromEntries(byStatus.map((g) => [g.status, g._count]));
  const openTotal = (cnt.APPROVED ?? 0) + (cnt.PACKING ?? 0);
  const age = (d: Date | null) => (d ? (now - d.getTime()) / H : 0);
  const stockAlertCount = alertCount[0]?.n ?? 0;
  const csvHref = "/api/pick-list" + (storeQ ? `?store=${encodeURIComponent(storeQ)}` : "");

  return (
    <div className="space-y-5">
      {embedded ? <h2 id="warehouse" className="text-base font-bold text-navy">Warehouse</h2> : <PageHeader title="Home" actions={<PrintButton />} />}
      <div className="print:hidden">
        <FilterBar fields={[{ type: "search", key: "store", placeholder: "Filter by store name or slug…" }]} />
      </div>

      <section className="grid grid-cols-3 gap-1.5 md:gap-2">
        {([["Today", uToday], ["Last 7 days", uWeek], ["This month", uMonth]] as const).map(([label, n]) => (
          <div key={label} className="panel border-t-4 border-t-ok p-2 text-center md:p-3">
            <div className="text-xl font-bold md:text-2xl"><Money cents={n * GP_FEE_PER_UNIT_CENTS} /></div>
            <div className="label mb-0">Packing fee · {label} · {n} unit{n === 1 ? "" : "s"}</div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-3 gap-1.5 md:grid-cols-5 md:gap-2">
        <Kpi href="/fulfillment?status=APPROVED" n={cnt.APPROVED ?? 0} label="To pack" />
        <Kpi href="/fulfillment?status=PACKING" n={cnt.PACKING ?? 0} label="Packing" />
        <Kpi href="/fulfillment?status=SHIPPED&view=table" n={shippedToday} label="Shipped today" tone="ok" />
        <Kpi n={warn} label="Waiting > 24h" tone={warn ? "warn" : "navy"} />
        <Kpi n={late} label="Late > 48h" tone={late ? "red" : "navy"} />
      </div>

      {stockAlertCount > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="label mb-0">Stock alerts · {stockAlertCount}</h2><Link href="/stock?status=low" className="text-sm text-navy underline">Manage stock</Link></div>
          <ul className="divide-y divide-line border border-red">
            {alerts.map((p) => {
              const free = p.onHand - p.reserved;
              return (
                <li key={p.id}>
                  <Link href={`/stock?q=${encodeURIComponent(p.sku)}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-hover">
                    <span className="min-w-0 truncate"><b>{p.name}</b> <span className="text-gray-500">{p.strength}</span></span>
                    <span className="shrink-0 text-xs tabular-nums">on hand <b>{p.onHand}</b> · reserved <b>{p.reserved}</b> · <b className={free <= 0 ? "text-red" : "text-warn"}>{free} free</b></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="label mb-0">Open queue · Premium first, then oldest{openTotal > TOP ? ` · ${TOP} of ${openTotal}` : ""}</h2>
          {openTotal > TOP && <Link href="/fulfillment?status=APPROVED,PACKING&view=table" className="text-sm text-navy underline">All {openTotal}</Link>}
        </div>
        {queue.length ? (
          <ul className="divide-y divide-line border border-line">
            {queue.map((o) => {
              const h = age(o.approvedAt);
              return (
                <li key={o.id}>
                  <Link href={`/fulfillment/${o.id}`} className={`flex items-center justify-between gap-2 border-l-4 p-3 text-sm hover:bg-hover ${h > 48 ? "border-red" : h > 24 ? "border-warn" : "border-transparent"}`}>
                    <span className="min-w-0 truncate"><b className="text-navy">{o.store.name} #{o.number}</b>{o.store.tier === "PREMIUM" && <span className="ml-1 border border-red px-1 text-[9px] font-bold uppercase text-red">Priority</span>} · {o._count.items} item(s) · {o.shipRegion}</span>
                    <span className="flex shrink-0 items-center gap-2"><Badge value={o.status} /><span className={`tabular-nums ${h > 48 ? "font-bold text-red" : ""}`}>{Math.floor(h)}h</span></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Queue is empty.</p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="label mb-0">Pick list · top {TOP} by units · {pickTotal._sum.qty ?? 0} units in open orders</h2>
          <a href={csvHref} className="btn h-8 text-xs print:hidden"><Download size={14} /> Full list (CSV)</a>
        </div>
        {pickRows.length ? (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[480px]">
              <thead><tr><th className="th">Product</th><th className="th">Strength</th><th className="th">SKU / code</th><th className="th text-right">Orders</th><th className="th text-right">Units</th></tr></thead>
              <tbody>
                {pickRows.map((r) => (
                  <tr key={r.id}>
                    <td className="td">{r.name}</td>
                    <td className="td">{r.strength}</td>
                    <td className="td text-xs text-gray-500">{r.sku}{r.sourceCode ? ` · ${r.sourceCode}` : ""}</td>
                    <td className="td text-right">{r.orders}</td>
                    <td className="td text-right font-bold">{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nothing to pick.</p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="label mb-0">Stores with the most open work · top {topStores.length}</h2>
          <Link href="/stores" className="text-sm text-navy underline">All stores</Link>
        </div>
        {topStores.length === 0 ? (
          <p className="text-sm text-gray-500">No open work.</p>
        ) : (
          <>
            <ul className="divide-y divide-line border border-line md:hidden">
              {topStores.map(({ storeId }) => {
                const s = sname.get(storeId);
                const row = matrix.get(storeId) ?? {};
                return (
                  <li key={storeId} className="p-3">
                    <Link href={`/s/${s?.slug}/orders`} className="font-semibold text-navy">{s?.name}</Link>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600">
                      {statuses.map((k) => (<span key={k} className={k === "ON_HOLD" && row[k] ? "font-bold text-red" : ""}>{k.replace("_", " ").toLowerCase()} <b>{row[k] ?? 0}</b></span>))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto border border-line md:block">
              <table className="w-full min-w-[640px]">
                <thead><tr><th className="th">Store</th>{statuses.map((s) => <th key={s} className="th text-right">{s.replace("_", " ")}</th>)}<th className="th text-right">Total</th></tr></thead>
                <tbody>
                  {topStores.map(({ storeId }) => {
                    const s = sname.get(storeId);
                    const row = matrix.get(storeId) ?? {};
                    return (
                      <tr key={storeId} className="hover:bg-hover">
                        <td className="td"><Link href={`/s/${s?.slug}/orders`} className="font-semibold text-navy">{s?.name}</Link></td>
                        {statuses.map((k) => (<td key={k} className={`td text-right tabular-nums ${k === "ON_HOLD" && row[k] ? "font-bold text-red" : ""}`}>{row[k] ?? 0}</td>))}
                        <td className="td text-right font-bold">{statuses.reduce((t, k) => t + (row[k] ?? 0), 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {stuckCount > 0 && (
        <section>
          <h2 className="label mb-2">Shipped &gt; 10 days, not delivered · {stuckCount}</h2>
          <ul className="divide-y divide-line border border-red">
            {stuck.map((o) => (
              <li key={o.id}>
                <Link href={`/fulfillment/${o.id}`} className="flex justify-between gap-2 p-3 text-sm hover:bg-hover">
                  <b className="text-navy">{o.store.name} #{o.number}</b>
                  <span className="text-gray-600">{o.carrier} {o.trackingNo}</span>
                </Link>
              </li>
            ))}
          </ul>
          {stuckCount > stuck.length && <Link href="/fulfillment?status=SHIPPED&view=table" className="mt-1 inline-block text-sm text-navy underline">All {stuckCount}</Link>}
        </section>
      )}
    </div>
  );
}

function Kpi({ n, label, href, tone = "navy" }: { n: number; label: string; href?: string; tone?: "navy" | "red" | "ok" | "warn" }) {
  const c = { navy: "border-t-navy", red: "border-t-red", ok: "border-t-ok", warn: "border-t-warn" }[tone];
  const txt = { navy: "", red: "text-red", ok: "text-ok", warn: "text-warn" }[tone];
  const body = (
    <>
      <div className={`text-xl font-bold md:text-2xl ${txt}`}>{n}</div>
      <div className="label mb-0">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className={`panel border-t-4 ${c} p-2 text-center hover:bg-hover md:p-3`}>{body}</Link>
  ) : (
    <div className={`panel border-t-4 ${c} p-2 text-center md:p-3`}>{body}</div>
  );
}
