import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { CustomerForm } from "@/components/CustomerForm";
import { DeleteCustomer } from "./DeleteCustomer";
import { OrderTable, orderSelect } from "@/components/OrderViews";
import { Money, fmtDate } from "@/components/ui";

export default async function CustomerPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { store, canSeePrices, canEdit } = await requireStore(slug);
  const c = await db.customer.findUnique({ where: { id } });
  if (!c || c.storeId !== store.id) notFound();
  const [orders, agg] = await Promise.all([
    db.order.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, select: orderSelect, take: 50 }),
    db.order.aggregate({ where: { customerId: id, status: { notIn: ["DRAFT", "CANCELLED"] } }, _sum: { totalCents: true }, _count: true, _max: { createdAt: true } }),
  ]);
  const base = `/s/${slug}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`${base}/customers`} className="text-sm text-navy"><ChevronLeft size={16} className="inline -mt-0.5" />Customers</Link>
        <div className="flex gap-2">
          {canEdit && <Link href={`${base}/orders/new`} className="btn-primary">+ Order</Link>}
          {canEdit && orders.length === 0 && <DeleteCustomer id={c.id} />}
        </div>
      </div>
      <h2 className="text-lg font-bold text-navy">{c.name}</h2>
      <div className="grid grid-cols-3 gap-2">
        <div className="panel border-l-4 border-navy p-3"><div className="label">Orders</div><div className="text-lg font-bold">{agg._count}</div></div>
        <div className="panel border-l-4 border-navy p-3"><div className="label">Wholesale</div><div className="text-lg font-bold"><Money cents={agg._sum.totalCents ?? 0} show={canSeePrices} /></div></div>
        <div className="panel border-l-4 border-navy p-3"><div className="label">Last order</div><div className="text-sm font-bold">{fmtDate(agg._max.createdAt)}</div></div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="panel p-3 md:p-4">
          <h3 className="label mb-3">Customer info</h3>
          {!canEdit ? (
            <dl className="space-y-1 text-sm">
              <div>{c.email}{c.phone ? ` · ${c.phone}` : ""}</div>
              {c.company && <div>{c.company}</div>}
              <div>{c.line1}{c.line2 ? `, ${c.line2}` : ""}</div>
              <div>{c.city}, {c.region} {c.postalCode} · {c.country}</div>
              {c.notes && <div className="whitespace-pre-wrap text-gray-600">{c.notes}</div>}
            </dl>
          ) : (
          <CustomerForm
            storeId={store.id}
            customerId={c.id}
            values={{
              name: c.name,
              email: c.email,
              phone: c.phone ?? "",
              company: c.company ?? "",
              line1: c.line1,
              line2: c.line2 ?? "",
              city: c.city,
              region: c.region,
              postalCode: c.postalCode,
              country: c.country,
              notes: c.notes ?? "",
              tags: c.tags.join(", "),
            }}
          />
          )}
        </section>
        <section>
          <h3 className="label mb-2">Order history</h3>
          <OrderTable rows={orders} href={(o) => `${base}/orders/${o.id}`} showMoney={canSeePrices} />
        </section>
      </div>
    </div>
  );
}
