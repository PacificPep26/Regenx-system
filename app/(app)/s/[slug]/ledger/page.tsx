import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { str, list, dateRange, centsRange, pageOf, flat, sortOf, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { Empty, Money, Pager } from "@/components/ui";
import { viewsFor } from "@/lib/views";

const BUCKETS = ["CREDIT", "OUTSTANDING", "SHIPPING"] as const;
const TYPES = ["DEPOSIT", "ORDER_DEBIT", "ORDER_REFUND", "OVERAGE", "OVERAGE_REVERSAL", "SHIPPING_CHARGE", "PAYMENT", "ADJUSTMENT"] as const;

export default async function LedgerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { user, store, canSeeMoney } = await requireStore(slug);
  if (!canSeeMoney) notFound();

  const and: Prisma.LedgerEntryWhereInput[] = [{ storeId: store.id }];
  const q = str(sp, "q");
  if (q) {
    const num = Number(q.replace(/^#/, ""));
    and.push({ OR: [{ memo: { contains: q, mode: "insensitive" } }, ...(Number.isInteger(num) && num > 0 ? [{ order: { number: num } }] : [])] });
  }
  const buckets = list(sp, "bucket", BUCKETS);
  if (buckets) and.push({ bucket: { in: buckets } });
  const types = list(sp, "type", TYPES);
  if (types) and.push({ type: { in: types } });
  const d = dateRange(sp, "from", "to");
  if (d) and.push({ createdAt: d });
  const amt = centsRange(sp, "min", "max");
  if (amt) and.push({ amountCents: amt });
  const where = { AND: and };

  const { page, skip, take } = pageOf(sp, 50);
  const [rows, count, views] = await Promise.all([
    db.ledgerEntry.findMany({ where, orderBy: sortOf(sp, ["createdAt", "amountCents"] as const, "createdAt_desc"), skip, take, include: { order: { select: { id: true, number: true } } } }),
    db.ledgerEntry.count({ where }),
    viewsFor(user.id, "ledger", store.id),
  ]);

  return (
    <div>
      <FilterBar
        database="ledger"
        storeId={store.id}
        views={views}
        fields={[
          { type: "search", key: "q", placeholder: "Search memo or order #…" },
          { type: "multi", key: "bucket", label: "Bucket", options: BUCKETS.map((b) => ({ value: b, label: b })) },
          { type: "multi", key: "type", label: "Type", options: TYPES.map((t) => ({ value: t, label: t.replace("_", " ") })) },
          { type: "date", from: "from", to: "to", label: "Date" },
          { type: "range", min: "min", max: "max", label: "Amount" },
          { type: "select", key: "sort", label: "Sort", options: [{ value: "createdAt_desc", label: "Newest" }, { value: "createdAt_asc", label: "Oldest" }, { value: "amountCents_desc", label: "Amount high" }, { value: "amountCents_asc", label: "Amount low" }] },
        ]}
      />
      {!rows.length ? (
        <Empty>No entries.</Empty>
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr><th className="th">Date</th><th className="th">Type</th><th className="th">Bucket</th><th className="th">Memo</th><th className="th text-right">Amount</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="td whitespace-nowrap text-xs">{e.createdAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="td text-xs font-semibold">{e.type.replace("_", " ")}</td>
                  <td className="td text-xs">{e.bucket}</td>
                  <td className="td text-sm">{e.order ? <Link className="text-navy underline" href={`/s/${slug}/orders/${e.order.id}`}>#{e.order.number}</Link> : null} {e.memo}</td>
                  <td className="td text-right font-semibold"><Money cents={e.amountCents} className={e.amountCents > 0 ? "text-ok" : ""} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
    </div>
  );
}
