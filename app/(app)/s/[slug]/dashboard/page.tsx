import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { getBalances } from "@/lib/balances";
import { statementPeriod } from "@/lib/ledger";
import { dateRange, flat, pageOf, str, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { Badge, Empty, Money, Pager, fmtDate } from "@/components/ui";
import { orderSelect } from "@/components/OrderViews";
import { TopUpButton } from "@/components/TopUpButton";
import { AddInventoryPanel } from "@/components/AddInventoryPanel";

const LIVE = { notIn: ["DRAFT", "CANCELLED"] as ("DRAFT" | "CANCELLED")[] };
const STATUSES = ["ON_HOLD", "APPROVED", "PACKING", "SHIPPED", "DELIVERED"] as const;
const DAY = 86400000;

/** Store home: where the deposit stands, order pipeline, sales, and per-product ordered/pending/shipped stats. */
export default async function StoreDashboard({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { user, store, canSeeMoney, canSeePrices, canEdit } = await requireStore(slug);
  const now = Date.now();
  const range = dateRange(sp, "from", "to");
  const q = str(sp, "q")?.toLowerCase();

  // this Monday-to-Monday week (New York): the same period the next statement will cover
  const week = statementPeriod(new Date(now + 7 * DAY));
  const [bal, byStatus, w7, w30, lastStmt, recent, weekLedger, invRows] = await Promise.all([
    getBalances(store.id),
    db.order.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
    db.order.aggregate({ where: { storeId: store.id, status: LIVE, submittedAt: { gte: new Date(now - 7 * DAY) } }, _sum: { totalCents: true }, _count: true }),
    db.order.aggregate({ where: { storeId: store.id, status: LIVE, submittedAt: { gte: new Date(now - 30 * DAY) } }, _sum: { totalCents: true }, _count: true }),
    db.statement.findFirst({ where: { storeId: store.id }, orderBy: { periodStart: "desc" } }),
    db.order.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 5, select: orderSelect }),
    canSeeMoney
      ? db.ledgerEntry.groupBy({ by: ["bucket", "type"], where: { storeId: store.id, createdAt: { gte: week.periodStart, lt: week.periodEnd }, type: { in: ["ORDER_DEBIT", "ORDER_REFUND", "OVERAGE", "OVERAGE_REVERSAL", "SHIPPING_CHARGE", "ADJUSTMENT"] } }, _sum: { amountCents: true } })
      : Promise.resolve([]),
    store.inventoryMode
      ? db.$queryRaw<{ units: number; value: bigint }[]>`SELECT COALESCE(SUM(ss."onHand" - ss."reserved"), 0)::int AS units, COALESCE(SUM((ss."onHand" - ss."reserved") * p."basePriceCents"), 0)::bigint AS value FROM "StoreStock" ss JOIN "Product" p ON p.id = ss."productId" WHERE ss."storeId" = ${store.id}`
      : Promise.resolve([]),
  ]);
  const sumOf = (bucket: string, types: string[]) => weekLedger.filter((r) => r.bucket === bucket && types.includes(r.type)).reduce((n, r) => n + (r._sum.amountCents ?? 0), 0);
  // cost of goods = what orders took from credit (+ what went over credit), net of cancellations
  const weekGoods = -sumOf("CREDIT", ["ORDER_DEBIT", "ORDER_REFUND"]) + sumOf("OUTSTANDING", ["OVERAGE", "OVERAGE_REVERSAL"]);
  const weekShipping = sumOf("SHIPPING", ["SHIPPING_CHARGE", "ADJUSTMENT"]);
  const invUnits = invRows[0]?.units ?? 0;
  const invValue = Math.round((Number(invRows[0]?.value ?? 0) * (10000 - store.discountBps)) / 10000);

  const topUpPending = user.role === "PARTNER_OWNER" ? (await db.topUpRequest.count({ where: { storeId: store.id, status: "REQUESTED" } })) > 0 : false;
  const counts = Object.fromEntries(byStatus.map((g) => [g.status, g._count]));
  const pctRaw = store.requiredBalanceCents ? (bal.CREDIT / store.requiredBalanceCents) * 100 : 0;
  const pct = Math.max(0, Math.min(100, pctRaw));
  const tone = bal.OUTSTANDING > 0 || pctRaw < 15 ? "bg-red" : pctRaw < 30 ? "bg-warn" : "bg-ok";
  const replenish = Math.max(0, store.requiredBalanceCents - bal.CREDIT);
  const nextStatement = statementPeriod(new Date(now + 7 * DAY)).periodEnd; // coming Monday (statement day)

  // per-product activity: one grouped + paginated SQL statement (windowed totals avoid extra round trips)
  const { page, skip, take } = pageOf(sp, 8);
  const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;
  const stats = await db.$queryRaw<{ id: string; sku: string; name: string; strength: string; ordered: number; pending: number; shipped: number; delivered: number; last: Date | null; total_rows: number; t_ordered: number; t_pending: number; t_shipped: number; t_delivered: number }[]>`
    WITH agg AS (
      SELECT oi."productId" AS id, p.sku, p.name, p.strength,
        SUM(oi.qty)::int AS ordered,
        COALESCE(SUM(oi.qty) FILTER (WHERE o.status IN ('ON_HOLD','APPROVED','PACKING')), 0)::int AS pending,
        COALESCE(SUM(oi.qty) FILTER (WHERE o.status = 'SHIPPED'), 0)::int AS shipped,
        COALESCE(SUM(oi.qty) FILTER (WHERE o.status = 'DELIVERED'), 0)::int AS delivered,
        MAX(o."submittedAt") AS last
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      JOIN "Product" p ON p.id = oi."productId"
      WHERE o."storeId" = ${store.id} AND o.status NOT IN ('DRAFT', 'CANCELLED')
        ${range?.gte ? Prisma.sql`AND o."submittedAt" >= ${range.gte}` : Prisma.empty}
        ${range?.lt ? Prisma.sql`AND o."submittedAt" < ${range.lt}` : Prisma.empty}
        ${like ? Prisma.sql`AND (p.name ILIKE ${like} OR p.sku ILIKE ${like} OR p.strength ILIKE ${like})` : Prisma.empty}
      GROUP BY oi."productId", p.sku, p.name, p.strength
    )
    SELECT *, COUNT(*) OVER ()::int AS total_rows, SUM(ordered) OVER ()::int AS t_ordered, SUM(pending) OVER ()::int AS t_pending,
           SUM(shipped) OVER ()::int AS t_shipped, SUM(delivered) OVER ()::int AS t_delivered
    FROM agg ORDER BY ordered DESC, name LIMIT ${take} OFFSET ${skip}`;
  const rows = stats;
  const totalRows = stats[0]?.total_rows ?? 0;
  const totals = { ordered: stats[0]?.t_ordered ?? 0, pending: stats[0]?.t_pending ?? 0, shipped: stats[0]?.t_shipped ?? 0, delivered: stats[0]?.t_delivered ?? 0 };
  const pageRows = rows;
  const base = `/s/${slug}`;
  const dueDate = lastStmt && lastStmt.status !== "PAID" ? lastStmt.dueAt : nextStatement;
  // keep the stats section open while the user is filtering/paging it
  const statsOpen = !!q || !!range || page > 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 1. what needs attention: deposit + order pipeline */}
        <section className="panel p-3 lg:col-span-2">
          {canSeeMoney && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
                <div className="min-w-0">
                  <div className="label mb-0 text-[10px]">Deposit</div>
                  <div className="text-xl font-bold text-navy md:text-2xl">
                    <Money cents={bal.CREDIT} /> <span className="text-xs font-normal text-gray-500">of <Money cents={store.requiredBalanceCents} /></span>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex w-full gap-2 sm:w-auto">
                    {store.inventoryMode && <AddInventoryPanel storeId={store.id} slug={slug} discountBps={store.discountBps} creditCents={bal.CREDIT} icon={false} label="+ Add inventory" className="btn h-9 flex-1 justify-center px-2 text-xs sm:h-10 sm:flex-none sm:px-4 sm:text-sm" />}
                    <Link href={`${base}/orders/new`} className="btn-primary h-9 flex-1 justify-center px-2 text-xs sm:h-10 sm:flex-none sm:px-4 sm:text-sm">+ Add order</Link>
                  </div>
                )}
              </div>
              <div className="mt-2 h-2 w-full border border-line bg-soft" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Credit remaining">
                <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
              </div>
              {(replenish > 0 || bal.OUTSTANDING > 0 || bal.SHIPPING > 0) && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs sm:text-sm">
                  <span className="min-w-0">
                    {replenish > 0 && <><b><Money cents={replenish} /></b> to restore your deposit by {fmtDate(dueDate)}</>}
                    {bal.OUTSTANDING > 0 && <Link href={`${base}/ledger`} className="ml-2 border border-red px-1.5 py-0.5 text-[11px] font-semibold text-red">Over credit <Money cents={bal.OUTSTANDING} /></Link>}
                    {bal.SHIPPING > 0 && <Link href={`${base}/ledger`} className="ml-2 border border-red px-1.5 py-0.5 text-[11px] font-semibold text-red">Shipping due <Money cents={bal.SHIPPING} /></Link>}
                  </span>
                  {user.role === "PARTNER_OWNER" && <TopUpButton className="h-8 px-2 text-xs" storeId={store.id} suggested={Math.max(replenish, bal.OUTSTANDING + bal.SHIPPING)} pending={topUpPending} />}
                </div>
              )}
              <dl className="mt-2 grid grid-cols-3 gap-x-2 text-sm sm:gap-x-3">
                {store.inventoryMode && <Fact label="Inventory" tone="line">{invUnits}u · <Money cents={invValue} /></Fact>}
                <Fact label="Goods / week" tone="line"><Money cents={weekGoods} /></Fact>
                <Fact label="Shipping / week" tone="line"><Money cents={weekShipping} /></Fact>
              </dl>
            </>
          )}
          {!canSeeMoney && canEdit && <Link href={`${base}/orders/new`} className="btn-primary mb-3">+ Add order</Link>}
          <div className={`grid grid-cols-5 gap-1 text-center ${canSeeMoney ? "mt-3 border-t border-line pt-3" : ""}`}>
            {STATUSES.map((s) => (
              <Link key={s} href={`${base}/orders?status=${s}`} className="px-0.5 py-1 hover:bg-hover">
                <div className={`text-lg font-bold leading-none ${s === "ON_HOLD" && counts[s] ? "text-red" : ""}`}>{counts[s] ?? 0}</div>
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[10px]">{s === "ON_HOLD" ? "On hold" : s === "APPROVED" ? "Received" : s.charAt(0) + s.slice(1).toLowerCase()}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* 2. latest activity */}
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="label mb-0">Recent orders</h2><Link href={`${base}/orders`} className="text-sm text-navy underline">All</Link></div>
          {!recent.length ? (
            <Empty>No orders yet.</Empty>
          ) : (
            <div className="border border-line">
              {canSeePrices && (
                <div className="grid grid-cols-[1fr_5.5rem_3.75rem_3.25rem] gap-2 border-b border-line bg-soft px-3 py-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                  <span>Order</span><span className="justify-self-end">Status</span><span className="justify-self-end">Goods</span><span className="justify-self-end">Ship</span>
                </div>
              )}
              <ul className="divide-y divide-line">
                {recent.slice(0, 5).map((o) => (
                  <li key={o.id}>
                    {/* fixed columns so statuses and amounts line up row to row */}
                    <Link href={`${base}/orders/${o.id}`} className={`grid items-center gap-2 px-3 py-2 text-sm hover:bg-hover ${canSeePrices ? "grid-cols-[1fr_5.5rem_3.75rem_3.25rem]" : "grid-cols-[1fr_5.5rem]"}`}>
                      <span className="min-w-0 truncate"><b className="text-navy">#{o.number}</b> {o.customer.name}</span>
                      <span className="justify-self-end"><Badge value={o.status} /></span>
                      {canSeePrices && <Money cents={o.totalCents} className="justify-self-end text-right text-xs" />}
                      {canSeePrices && (o.shippingFeeCents != null ? <Money cents={o.shippingFeeCents} className="justify-self-end text-right text-xs text-gray-600" /> : <span className="justify-self-end text-xs text-gray-300">—</span>)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* 3. reference only: collapsed until asked for */}
      <details className="group panel" open={statsOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3 [&::-webkit-details-marker]:hidden">
          <span className="font-semibold text-navy">Sales &amp; product stats</span>
          <span className="flex items-center gap-2 text-xs text-gray-500">
            {canSeeMoney && <span className="hidden sm:inline">7d <b><Money cents={w7._sum.totalCents ?? 0} /></b> · 30d <b><Money cents={w30._sum.totalCents ?? 0} /></b> · </span>}
            {totalRows} products
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="space-y-3 border-t border-line p-3">
          {canSeeMoney && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
              <Fact label="Last 7 days" tone="ok"><Money cents={w7._sum.totalCents ?? 0} /> <span className="text-xs text-gray-500">· {w7._count} order(s)</span></Fact>
              <Fact label="Last 30 days" tone="line"><Money cents={w30._sum.totalCents ?? 0} /> <span className="text-xs text-gray-500">· {w30._count} order(s)</span></Fact>
              <Fact label="Next statement" tone="line">{fmtDate(nextStatement)}{lastStmt && <> <Badge value={lastStmt.status} /></>}</Fact>
            </dl>
          )}
          <div>
            <h2 className="label mb-2">Products · ordered / pending / shipped</h2>
            <FilterBar
              fields={[
                { type: "search", key: "q", placeholder: "Search product or SKU…" },
                { type: "date", from: "from", to: "to", label: "Period (submitted)" },
              ]}
            />
            {!rows.length ? (
              <Empty>No product activity yet.</Empty>
            ) : (
              <>
                <ul className="divide-y divide-line border border-line md:hidden">
                  {pageRows.map((r) => (
                    <li key={r.id} className="px-3 py-2">
                      <div className="truncate text-sm font-medium">{r.name} <span className="font-normal text-gray-500">{r.strength}</span></div>
                      <div className="text-xs text-gray-600">
                        ordered <b>{r.ordered}</b> · pending <b className={r.pending ? "text-warn" : ""}>{r.pending}</b> · shipped <b>{r.shipped}</b> · delivered <b className="text-ok">{r.delivered}</b>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto border border-line md:block">
                  <table className="w-full">
                    <thead><tr><th className="th">Product</th><th className="th text-right">Ordered</th><th className="th text-right">Pending</th><th className="th text-right">Shipped</th><th className="th text-right">Delivered</th><th className="th">Last</th></tr></thead>
                    <tbody>
                      {pageRows.map((r) => (
                        <tr key={r.id} className="hover:bg-hover">
                          <td className="td py-1.5 font-medium">{r.name} <span className="font-normal text-gray-500">{r.strength}</span></td>
                          <td className="td py-1.5 text-right font-bold">{r.ordered}</td>
                          <td className={`td py-1.5 text-right ${r.pending ? "font-bold text-warn" : ""}`}>{r.pending}</td>
                          <td className="td py-1.5 text-right">{r.shipped}</td>
                          <td className="td py-1.5 text-right text-ok">{r.delivered}</td>
                          <td className="td whitespace-nowrap py-1.5 text-xs">{fmtDate(r.last)}</td>
                        </tr>
                      ))}
                      <tr><td className="td font-bold">Total · {totalRows} products</td><td className="td text-right font-bold">{totals.ordered}</td><td className="td text-right font-bold">{totals.pending}</td><td className="td text-right font-bold">{totals.shipped}</td><td className="td text-right font-bold">{totals.delivered}</td><td className="td" /></tr>
                    </tbody>
                  </table>
                </div>
                <Pager page={page} pages={Math.ceil(totalRows / take)} params={flat(sp)} />
              </>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

function Fact({ label, tone, children }: { label: string; tone: "red" | "ok" | "line"; children: React.ReactNode }) {
  const border = { red: "border-red", ok: "border-ok", line: "border-line" }[tone];
  return (
    <div className={`border-l-4 ${border} pl-2`}>
      <dt className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-gray-500 sm:text-[10px]">{label}</dt>
      <dd className="text-xs font-semibold sm:text-sm">{children}</dd>
    </div>
  );
}
