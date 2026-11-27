import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { hasLegacyStores } from "@/lib/legacyStock";
import { str, one, pageOf, flat, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { Empty, PageHeader, Pager } from "@/components/ui";
import { StockRow, type StockRowData } from "./StockRow";

const FILTERS = ["all", "tracked", "short", "out", "low", "ok", "untracked"] as const;
type Row = Omit<StockRowData, "available"> & { total_rows: number };

/** GP / admin stock control. Counters are cached on Product by DB triggers; filtering, sorting and paging all happen in SQL. */
export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole("ADMIN", "FULFILLMENT");
  if (!(await hasLegacyStores())) redirect("/inventory"); // every store is on inventory mode: GP's warehouse is the stores' inventory
  const sp = await searchParams;
  const q = str(sp, "q");
  // default view = products we actually control; searching or picking "All" reveals the rest
  const filter = one(sp, "status", [...FILTERS]) ?? (q ? "all" : "tracked");
  const { page, skip, take } = pageOf(sp, 30);
  const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;

  const cond =
    filter === "tracked" ? Prisma.sql`"trackStock"`
    : filter === "short" ? Prisma.sql`"trackStock" AND "onHand" < "reserved"`
    : filter === "all" ? Prisma.sql`TRUE`
    : Prisma.sql`status = ${filter}`;

  const [rows, kpiRows] = await Promise.all([
    db.$queryRaw<Row[]>`
      WITH s AS (
        SELECT id, sku, name, strength, "trackStock", "reorderLevel", "onHand", "reserved",
          CASE WHEN NOT "trackStock" THEN 'untracked'
               WHEN "onHand" - "reserved" <= 0 THEN 'out'
               WHEN "onHand" - "reserved" <= "reorderLevel" THEN 'low'
               ELSE 'ok' END AS status
        FROM "Product"
        WHERE active ${like ? Prisma.sql`AND (name ILIKE ${like} OR sku ILIKE ${like} OR strength ILIKE ${like})` : Prisma.empty}
      )
      SELECT *, COUNT(*) OVER ()::int AS total_rows
      FROM s WHERE ${cond}
      ORDER BY CASE status WHEN 'out' THEN 0 WHEN 'low' THEN 1 WHEN 'ok' THEN 2 ELSE 3 END, name, strength
      LIMIT ${take} OFFSET ${skip}`,
    db.$queryRaw<{ tracked: number; out: number; low: number; short: number }[]>`
      SELECT COUNT(*) FILTER (WHERE "trackStock")::int AS tracked,
             COUNT(*) FILTER (WHERE "trackStock" AND "onHand" - "reserved" <= 0)::int AS out,
             COUNT(*) FILTER (WHERE "trackStock" AND "onHand" - "reserved" > 0 AND "onHand" - "reserved" <= "reorderLevel")::int AS low,
             COUNT(*) FILTER (WHERE "trackStock" AND "onHand" < "reserved")::int AS short
      FROM "Product" WHERE active`,
  ]);
  const kpi = kpiRows[0] ?? { tracked: 0, out: 0, low: 0, short: 0 };
  const total = rows[0]?.total_rows ?? 0;
  const data: StockRowData[] = rows.map((r) => ({ ...r, available: r.onHand - r.reserved }));

  const chip = (label: string, n: number, href: string, tone: string) => (
    <Link href={href} className={`panel border-t-4 p-2 text-center hover:bg-hover ${tone}`}>
      <div className="text-xl font-bold">{n}</div>
      <div className="label mb-0 text-[10px]">{label}</div>
    </Link>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Stock" actions={<Link href="/stock/history" className="btn">History</Link>} />
      <div className="grid grid-cols-4 gap-1.5 md:gap-2">
        {chip("Limited", kpi.tracked, "/stock?status=tracked", "border-t-navy")}
        {chip("Out", kpi.out, "/stock?status=out", kpi.out ? "border-t-red text-red" : "border-t-navy")}
        {chip("Low", kpi.low, "/stock?status=low", kpi.low ? "border-t-warn text-warn" : "border-t-navy")}
        {chip("Short", kpi.short, "/stock?status=short", kpi.short ? "border-t-red text-red" : "border-t-navy")}
      </div>
      <FilterBar
        fields={[
          { type: "search", key: "q", placeholder: "Search product or SKU…" },
          { type: "select", key: "status", label: "Show", options: [
            { value: "all", label: "All products" }, { value: "tracked", label: "Limited only" }, { value: "short", label: "Short (promised > on hand)" },
            { value: "out", label: "Out" }, { value: "low", label: "Low" }, { value: "ok", label: "OK" }, { value: "untracked", label: "Unlimited" },
          ] },
        ]}
      />
      <p className="text-xs text-gray-500">
        Limited products block shipping when on hand is short. Unlimited products ship with no stock check. Receiving stock makes a product limited. {total} match.
      </p>
      {!data.length ? (
        <Empty>{filter === "tracked" && !q ? "Every product is unlimited for now. Search a product above, open it and receive stock to start limiting it by stock." : "No products match."}</Empty>
      ) : (
        <>
          <ul className="divide-y divide-line border border-line">
            {data.map((r) => <StockRow key={r.id} r={r} />)}
          </ul>
          <Pager page={page} pages={Math.ceil(total / take)} params={flat(sp)} />
        </>
      )}
    </div>
  );
}
