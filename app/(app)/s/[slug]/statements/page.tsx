import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { list, dateRange, pageOf, flat, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { StatementList } from "@/components/StatementList";
import { Pager } from "@/components/ui";

const ST = ["ISSUED", "PAID", "OVERDUE"] as const;

export default async function StatementsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { store, canSeeMoney } = await requireStore(slug);
  if (!canSeeMoney) notFound();
  const status = list(sp, "status", ST);
  const d = dateRange(sp, "from", "to");
  const where = { storeId: store.id, ...(status ? { status: { in: status } } : {}), ...(d ? { periodStart: d } : {}) };
  const { page, skip, take } = pageOf(sp);
  const [rows, count] = await Promise.all([
    db.statement.findMany({ where, orderBy: { periodStart: "desc" }, skip, take, include: { store: { select: { name: true, slug: true } } } }),
    db.statement.count({ where }),
  ]);
  return (
    <div>
      <FilterBar
        fields={[
          { type: "multi", key: "status", label: "Status", options: ST.map((s) => ({ value: s, label: s })) },
          { type: "date", from: "from", to: "to", label: "Week starting" },
        ]}
      />
      <StatementList rows={rows} />
      <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
    </div>
  );
}
