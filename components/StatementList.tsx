import Link from "next/link";
import { Badge, Empty, Money, fmtDate } from "./ui";

type Row = {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  dueAt: Date;
  status: string;
  replenishDueCents: number;
  outstandingDueCents: number;
  shippingDueCents: number;
  closingCreditCents: number;
  store: { name: string; slug: string };
};

export function StatementList({ rows, showStore }: { rows: Row[]; showStore?: boolean }) {
  if (!rows.length) return <Empty>No statements.</Empty>;
  return (
    <ul className="divide-y divide-line border border-line">
      {rows.map((s) => {
        const due = s.replenishDueCents + s.outstandingDueCents + s.shippingDueCents;
        return (
          <li key={s.id}>
            <Link href={`/s/${s.store.slug}/statements/${s.id}`} className="grid grid-cols-2 gap-1 p-3 text-sm hover:bg-hover md:grid-cols-6 md:items-center">
              <div className="col-span-2 font-semibold text-navy md:col-span-2">
                {showStore && `${s.store.name} · `}
                {fmtDate(s.periodStart)} – {fmtDate(new Date(s.periodEnd.getTime() - 1))}
              </div>
              <div className="md:text-center"><Badge value={s.status} /></div>
              <div className="text-right md:text-left">Credit <Money cents={s.closingCreditCents} /></div>
              <div>Due <b><Money cents={due} className={due > 0 ? "text-red" : ""} /></b></div>
              <div className="text-right text-xs text-gray-500">by {fmtDate(s.dueAt)}</div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
