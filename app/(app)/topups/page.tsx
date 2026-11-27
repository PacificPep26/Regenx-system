import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { formatUSD } from "@/lib/money";
import { TopUpAdminButtons } from "@/components/TopUpAdminButtons";
import { Badge, Empty, Money, PageHeader, fmtDateTime } from "@/components/ui";

/** Admin: stores asking to add funds. Record the payment once the money arrived. */
export default async function TopUps() {
  await requireRole("ADMIN");
  const rows = await db.topUpRequest.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 50, include: { store: { select: { name: true, slug: true, creditCents: true, requiredBalanceCents: true } } } });
  return (
    <div className="space-y-4">
      <PageHeader title="Top-up requests" />
      {rows.length ? (
        <ul className="divide-y divide-line border border-line">
          {rows.map((r) => (
            <li key={r.id} className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link href={`/s/${r.store.slug}/ledger`} className="font-semibold text-navy hover:underline">{r.store.name}</Link> · <b><Money cents={r.amountCents} /></b> · {fmtDateTime(r.createdAt)}
                </span>
                <Badge value={r.status === "REQUESTED" ? "PENDING" : r.status} />
              </div>
              <div className="text-xs text-gray-500">
                Credit <Money cents={r.store.creditCents} /> of {formatUSD(r.store.requiredBalanceCents)} minimum{r.note ? ` · ${r.note}` : ""}
              </div>
              {r.status === "REQUESTED" && <TopUpAdminButtons id={r.id} amount={formatUSD(r.amountCents)} />}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No requests.</Empty>
      )}
    </div>
  );
}
