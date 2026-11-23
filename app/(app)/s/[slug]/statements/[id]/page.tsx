import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { Badge, Money, fmtDate } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

export default async function StatementPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { store, canSeeMoney } = await requireStore(slug);
  if (!canSeeMoney) notFound();
  const st = await db.statement.findUnique({ where: { id } });
  if (!st || st.storeId !== store.id) notFound();
  const orders = await db.order.findMany({
    where: { storeId: store.id, submittedAt: { gte: st.periodStart, lt: st.periodEnd }, status: { not: "DRAFT" } },
    orderBy: { submittedAt: "asc" },
    select: { id: true, number: true, submittedAt: true, status: true, totalCents: true, creditAppliedCents: true, overageCents: true, shippingFeeCents: true, customer: { select: { name: true } } },
  });
  const totalDue = st.replenishDueCents + st.outstandingDueCents + st.shippingDueCents;
  const row = (k: string, v: number, strong = false) => (
    <div className={`flex justify-between py-1 ${strong ? "font-bold" : ""}`}><span>{k}</span><Money cents={v} /></div>
  );
  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex justify-between print:hidden">
        <Link href={`/s/${slug}/statements`} className="text-sm text-navy"><ChevronLeft size={16} className="inline -mt-0.5" />Statements</Link>
        <PrintButton />
      </div>
      <div className="panel border-t-4 border-t-red p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-bold tracking-wide text-navy">REGENX LABS · Weekly statement</div>
            <div className="text-sm">{store.name} · {store.tier}</div>
            <div className="text-sm text-gray-500">{fmtDate(st.periodStart)} – {fmtDate(new Date(st.periodEnd.getTime() - 1))}</div>
          </div>
          <Badge value={st.status} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            {row("Previous balance", st.openingCreditCents)}
            {row("Orders deducted", -st.debitsCents)}
            {row("Remaining credit", st.closingCreditCents, true)}
            {row("Required balance", store.requiredBalanceCents)}
          </div>
          <div className="border-l-4 border-navy pl-3">
            {row("Replenishment required", st.replenishDueCents)}
            {row("Outstanding (overage)", st.outstandingDueCents)}
            {row("Shipping charges", st.shippingDueCents)}
            <div className="mt-1 flex justify-between border-t border-line pt-1 text-base font-bold text-red"><span>Total due by {fmtDate(st.dueAt)}</span><Money cents={totalDue} /></div>
          </div>
        </div>
        <h3 className="label mt-6">Orders processed ({orders.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead><tr><th className="th">#</th><th className="th">Date</th><th className="th">Customer</th><th className="th text-right">Wholesale</th><th className="th text-right">Overage</th><th className="th text-right">Ship</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="td"><Link className="text-navy" href={`/s/${slug}/orders/${o.id}`}>#{o.number}</Link>{o.status === "CANCELLED" && <span className="ml-1 text-xs text-gray-400">cancelled</span>}</td>
                  <td className="td text-xs">{fmtDate(o.submittedAt)}</td>
                  <td className="td">{o.customer.name}</td>
                  <td className="td text-right"><Money cents={o.totalCents} /></td>
                  <td className="td text-right"><Money cents={o.overageCents} /></td>
                  <td className="td text-right"><Money cents={o.shippingFeeCents} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
