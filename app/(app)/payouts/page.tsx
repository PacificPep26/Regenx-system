import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { payoutSummary } from "@/lib/gpEarnings";
import { one, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { ResolvePayoutButtons } from "@/components/PayoutButtons";
import { formatUSD } from "@/lib/money";
import { Badge, Empty, Money, PageHeader, fmtDateTime } from "@/components/ui";

const STATUSES = ["REQUESTED", "PAID", "REJECTED"] as const;

/** Admin: GP payout requests to approve (mark paid) or reject. */
export default async function Payouts({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const status = one(sp, "status", STATUSES);
  const [sum, rows] = await Promise.all([payoutSummary(), db.gpPayout.findMany({ where: { status }, orderBy: { requestedAt: "desc" }, take: 50 })]);
  return (
    <div className="space-y-4">
      <PageHeader title="GP payouts" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {([["Earned by GP", sum.earned], ["Paid", sum.paid], ["Waiting", sum.pending], ["Not yet requested", sum.available]] as const).map(([l, c]) => (
          <div key={l} className="panel border-t-4 border-t-navy p-3 text-center">
            <div className="text-xl font-bold"><Money cents={c} /></div>
            <div className="label mb-0">{l}</div>
          </div>
        ))}
      </div>
      <FilterBar fields={[{ type: "select", key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s })) }]} />
      {rows.length ? (
        <ul className="divide-y divide-line border border-line">
          {rows.map((p) => (
            <li key={p.id} className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b className="text-navy"><Money cents={p.amountCents} /></b> · requested {fmtDateTime(p.requestedAt)}</span>
                <Badge value={p.status} />
              </div>
              {p.status === "REQUESTED" ? (
                <ResolvePayoutButtons id={p.id} amount={formatUSD(p.amountCents)} />
              ) : (
                <div className="text-xs text-gray-500">{fmtDateTime(p.resolvedAt)}{p.method ? ` · ${p.method}` : ""}{p.reference ? ` · ${p.reference}` : ""}{p.note ? ` · ${p.note}` : ""}</div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No requests.</Empty>
      )}
    </div>
  );
}
