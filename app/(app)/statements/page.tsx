import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { list, str, dateRange, pageOf, flat, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { StatementList } from "@/components/StatementList";
import { PageHeader, Pager } from "@/components/ui";

const ST = ["ISSUED", "PAID", "OVERDUE"] as const;

export default async function AllStatements({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const stores = await db.store.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } });
  const status = list(sp, "status", ST);
  const store = str(sp, "store");
  const d = dateRange(sp, "from", "to");
  const where = { ...(status ? { status: { in: status } } : {}), ...(store ? { store: { slug: store } } : {}), ...(d ? { periodStart: d } : {}) };
  const { page, skip, take } = pageOf(sp);
  const [rows, count] = await Promise.all([
    db.statement.findMany({ where, orderBy: [{ periodStart: "desc" }, { store: { name: "asc" } }], skip, take, include: { store: { select: { name: true, slug: true } } } }),
    db.statement.count({ where }),
  ]);
  return (
    <div>
      <PageHeader title="Statements" />
      <FilterBar
        fields={[
          { type: "multi", key: "status", label: "Status", options: ST.map((s) => ({ value: s, label: s })) },
          { type: "select", key: "store", label: "Store", options: stores.map((s) => ({ value: s.slug, label: s.name })) },
          { type: "date", from: "from", to: "to", label: "Week starting" },
        ]}
      />
      <StatementList rows={rows} showStore />
      <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
    </div>
  );
}
