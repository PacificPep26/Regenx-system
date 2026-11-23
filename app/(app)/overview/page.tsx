import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { health } from "@/lib/balances";
import { Badge, Money, PageHeader, Stat, fmtDate } from "@/components/ui";
import { RunStatements } from "./RunStatements";
import { GpBoard } from "@/components/GpBoard";
import type { SP } from "@/lib/query";

const DOT = { green: "bg-ok", yellow: "bg-warn", red: "bg-red" };
const TOP = 8; // every list here is a bounded "top N" with a link to the full, paginated page

export default async function Overview({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole("ADMIN");
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const [totalsAgg, storeCount, attention, holdCount, holds, queue, overdueCount, overdue, week, late, lowStock] = await Promise.all([
    db.store.aggregate({ _sum: { creditCents: true, outstandingCents: true, shippingCents: true } }),
    db.store.count(),
    // stores that most need a look: owe the most, then have the least credit
    db.store.findMany({ orderBy: [{ outstandingCents: "desc" }, { creditCents: "asc" }], take: TOP, include: { statements: { where: { status: "OVERDUE" }, select: { id: true }, take: 1 } } }),
    db.order.count({ where: { status: "ON_HOLD" } }),
    db.order.findMany({ where: { status: "ON_HOLD" }, orderBy: { submittedAt: "asc" }, take: TOP, select: { id: true, number: true, overageCents: true, store: { select: { name: true, slug: true } }, customer: { select: { name: true } } } }),
    db.order.groupBy({ by: ["status"], where: { status: { in: ["APPROVED", "PACKING"] } }, _count: true }),
    db.statement.count({ where: { status: "OVERDUE" } }),
    db.statement.findMany({ where: { status: "OVERDUE" }, include: { store: { select: { name: true, slug: true } } }, orderBy: { dueAt: "asc" }, take: TOP }),
    db.order.aggregate({ where: { submittedAt: { gte: weekAgo }, status: { notIn: ["DRAFT", "CANCELLED"] } }, _sum: { totalCents: true }, _count: true }),
    db.order.count({ where: { status: { in: ["APPROVED", "PACKING"] }, approvedAt: { lte: new Date(Date.now() - 48 * 3600_000) } } }),
    db.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Product" WHERE "trackStock" AND active AND ("onHand" - "reserved") <= "reorderLevel"`,
  ]);
  const totals = { credit: totalsAgg._sum.creditCents ?? 0, out: totalsAgg._sum.outstandingCents ?? 0, ship: totalsAgg._sum.shippingCents ?? 0 };
  const q = Object.fromEntries(queue.map((g) => [g.status, g._count]));
  const more = (n: number, href: string, label: string) => (n > TOP ? <Link href={href} className="mt-1 inline-block text-sm text-navy underline">{label} ({n})</Link> : null);

  return (
    <div className="space-y-4">
      <PageHeader title="Home" actions={<RunStatements />} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="7-day wholesale" cents={week._sum.totalCents ?? 0} tone="ok" />
        <Stat label="Partner credit held" cents={totals.credit} />
        <Stat label="Outstanding" cents={totals.out} tone={totals.out > 0 ? "red" : "navy"} />
        <Stat label="Shipping due" cents={totals.ship} tone={totals.ship > 0 ? "red" : "navy"} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-5">
        <Link href="/fulfillment?status=APPROVED" className="panel border-t-4 border-t-navy p-3"><div className="text-2xl font-bold">{q.APPROVED ?? 0}</div><div className="label">To pack</div></Link>
        <Link href="/fulfillment?status=PACKING" className="panel border-t-4 border-t-navy p-3"><div className="text-2xl font-bold">{q.PACKING ?? 0}</div><div className="label">Packing</div></Link>
        <a href="#holds" className="panel border-t-4 border-t-red p-3"><div className="text-2xl font-bold text-red">{holdCount}</div><div className="label">On hold</div></a>
        <Link href="#warehouse" className={`panel border-t-4 p-3 ${late ? "border-t-red" : "border-t-navy"}`}><div className={`text-2xl font-bold ${late ? "text-red" : ""}`}>{late}</div><div className="label">Late &gt; 48h</div></Link>
        <Link href="/stock?status=low" className={`panel border-t-4 p-3 ${lowStock[0]?.n ? "border-t-red" : "border-t-navy"}`}><div className={`text-2xl font-bold ${lowStock[0]?.n ? "text-red" : ""}`}>{lowStock[0]?.n ?? 0}</div><div className="label">Low stock</div></Link>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="label mb-0">Stores needing attention · top {Math.min(TOP, storeCount)} of {storeCount}</h2>
          <Link href="/stores" className="text-sm text-navy underline">All stores</Link>
        </div>
        <ul className="divide-y divide-line border border-line">
          {attention.map((s) => {
            const h = health({ CREDIT: s.creditCents, OUTSTANDING: s.outstandingCents, SHIPPING: s.shippingCents }, s.requiredBalanceCents, s.statements.length > 0);
            return (
              <li key={s.id}>
                <Link href={`/s/${s.slug}/dashboard`} className="grid grid-cols-2 items-center gap-1 p-3 text-sm hover:bg-hover md:grid-cols-5">
                  <span className="col-span-2 flex items-center gap-2 font-semibold text-navy md:col-span-2"><span className={`h-2.5 w-2.5 shrink-0 ${DOT[h]}`} />{s.name} <Badge value={s.tier} /></span>
                  <span className="text-xs md:text-sm"><span className="text-gray-400 md:hidden">Credit </span><Money cents={s.creditCents} /> <span className="text-xs text-gray-400">/ {s.requiredBalanceCents / 100000}k</span></span>
                  <span className="text-xs md:text-sm"><span className="text-gray-400 md:hidden">Owes </span><Money cents={s.outstandingCents} className={s.outstandingCents > 0 ? "text-red" : ""} /></span>
                  <span className="text-xs md:text-sm"><span className="text-gray-400 md:hidden">Ship </span><Money cents={s.shippingCents} /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="holds">
        <h2 className="label mb-2">On hold · over credit</h2>
        {holds.length ? (
          <>
            <ul className="divide-y divide-line border border-red">
              {holds.map((o) => (
                <li key={o.id}>
                  <Link href={`/s/${o.store.slug}/orders/${o.id}`} className="flex justify-between gap-2 p-3 text-sm hover:bg-hover">
                    <span><b className="text-navy">{o.store.name} #{o.number}</b> · {o.customer.name}</span>
                    <span>over <Money cents={o.overageCents} className="font-bold text-red" /></span>
                  </Link>
                </li>
              ))}
            </ul>
            {more(holdCount, "/fulfillment?status=ON_HOLD", "All on hold")}
          </>
        ) : <p className="text-sm text-gray-500">None.</p>}
      </section>

      {overdueCount > 0 && (
        <section>
          <h2 className="label mb-2">Overdue statements</h2>
          <ul className="divide-y divide-line border border-red">
            {overdue.map((s) => (
              <li key={s.id}>
                <Link href={`/s/${s.store.slug}/statements/${s.id}`} className="flex justify-between p-3 text-sm hover:bg-hover">
                  <b className="text-navy">{s.store.name}</b>
                  <span>due {fmtDate(s.dueAt)} · <Money cents={s.replenishDueCents + s.outstandingDueCents + s.shippingDueCents} className="font-bold text-red" /></span>
                </Link>
              </li>
            ))}
          </ul>
          {more(overdueCount, "/statements?status=OVERDUE", "All overdue")}
        </section>
      )}
      <GpBoard searchParams={searchParams} embedded />
    </div>
  );
}
