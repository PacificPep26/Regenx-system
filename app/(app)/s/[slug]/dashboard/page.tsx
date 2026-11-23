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

const LIVE = { notIn: ["DRAFT", "CANCELLED"] as ("DRAFT" | "CANCELLED")[] };
const PENDING = ["ON_HOLD", "APPROVED", "PACKING"];
const STATUSES = ["ON_HOLD", "APPROVED", "PACKING", "SHIPPED", "DELIVERED"] as const;
const DAY = 86400000;

/** Store home: where the deposit stands, order pipeline, sales, and per-product ordered/pending/shipped stats. */
export default async function StoreDashboard({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { store, canSeeMoney, canEdit } = await requireStore(slug);
  const now = Date.now();
  const range = dateRange(sp, "from", "to");
  const q = str(sp, "q")?.toLowerCase();

  const [bal, byStatus, w7, w30, lastStmt, recent] = await Promise.all([
    getBalances(store.id),
    db.order.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
    db.order.aggregate({ where: { storeId: store.id, status: LIVE, submittedAt: { gte: new Date(now - 7 * DAY) } }, _sum: { totalCents: true }, _count: true }),
    db.order.aggregate({ where: { storeId: store.id, status: LIVE, submittedAt: { gte: new Date(now - 30 * DAY) } }, _sum: { totalCents: true }, _count: true }),
    db.statement.findFirst({ where: { storeId: store.id }, orderBy: { periodStart: "desc" } }),
    db.order.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 5, select: orderSelect }),
  ]);

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
  const onHold = counts.ON_HOLD ?? 0;
  const dueDate = lastStmt && lastStmt.status !== "PAID" ? lastStmt.dueAt : nextStatement;
  // keep the stats section open while the user is filtering/paging it
  const statsOpen = !!q || !!range || page > 1;

  const alerts: { tone: "red" | "warn"; text: React.ReactNode; href?: string }[] = [];
  if (canSeeMoney && replenish > 0) alerts.push({ tone: lastStmt?.status === "OVERDUE" ? "red" : "warn", text: <>Replenish <b><Money cents={replenish} /></b> to restore your deposit · by {fmtDate(dueDate)}</>, href: `${base}/statements` });
  if (canSeeMoney && bal.OUTSTANDING > 0) alerts.push({ tone: "red", text: <>Outstanding overage <b><Money cents={bal.OUTSTANDING} /></b> is due</>, href: `${base}/ledger` });
  if (onHold > 0) alerts.push({ tone: "red", text: <><b>{onHold}</b> order(s) on hold, waiting for approval</>, href: `${base}/orders?status=ON_HOLD` });

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <ul className="space-y-1">
          {alerts.map((a, i) => (
            <li key={i} className={`border-l-4 bg-white px-3 py-2 text-sm ${a.tone === "red" ? "border-red bg-red/5" : "border-warn bg-warn/5"}`}>
              {a.href ? <Link href={a.href} className="hover:underline">{a.text}</Link> : a.text}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 1. what needs attention: deposit + order pipeline */}
        <section className="panel p-3 lg:col-span-2">
          {canSeeMoney && (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="label mb-0 text-[10px]">Deposit</div>
                  <div className="text-xl font-bold text-navy md:text-2xl">
                    <Money cents={bal.CREDIT} /> <span className="text-xs font-normal text-gray-500">of <Money cents={store.requiredBalanceCents} /></span>
                  </div>
                </div>
                {canEdit && <Link href={`${base}/orders/new`} className="btn-primary shrink-0">+ New order</Link>}
              </div>
              <div className="mt-2 h-2 w-full border border-line bg-soft" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Credit remaining">
                <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 text-sm">
                <Fact label="To replenish" tone={replenish > 0 ? "red" : "ok"}><Money cents={replenish} /></Fact>
                <Fact label="Outstanding" tone={bal.OUTSTANDING > 0 ? "red" : "line"}><Money cents={bal.OUTSTANDING} /></Fact>
                <Fact label="Shipping due" tone={bal.SHIPPING > 0 ? "red" : "line"}><Money cents={bal.SHIPPING} /></Fact>
              </dl>
            </>
          )}
          {!canSeeMoney && canEdit && <Link href={`${base}/orders/new`} className="btn-primary mb-3">+ New order</Link>}
          <div className={`grid grid-cols-5 gap-1 text-center ${canSeeMoney ? "mt-3 border-t border-line pt-3" : ""}`}>
            {STATUSES.map((s) => (
              <Link key={s} href={`${base}/orders?status=${s}`} className="px-0.5 py-1 hover:bg-hover">
                <div className={`text-lg font-bold leading-none ${s === "ON_HOLD" && counts[s] ? "text-red" : ""}`}>{counts[s] ?? 0}</div>
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500 sm:text-[10px]">{s === "ON_HOLD" ? "On hold" : s.charAt(0) + s.slice(1).toLowerCase()}</div>
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
            <ul className="divide-y divide-line border border-line">
              {recent.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <Link href={`${base}/orders/${o.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-hover">
                    <span className="min-w-0 truncate"><b className="text-navy">#{o.number}</b> {o.customer.name}</span>
                    <span className="flex shrink-0 items-center gap-2"><Badge value={o.status} />{canSeeMoney && <Money cents={o.totalCents} className="text-xs" />}</span>
                  </Link>
                </li>
              ))}
            </ul>
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
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}
