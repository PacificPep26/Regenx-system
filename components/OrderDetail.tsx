import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Money, fmtDate } from "./ui";

export async function loadOrder(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      store: true,
      customer: true,
      items: { include: { product: true } },
      ledger: { orderBy: { createdAt: "asc" } },
    },
  });
}
type Full = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

const STEPS = [
  ["Created", "createdAt"],
  ["Submitted", "submittedAt"],
  ["Approved", "approvedAt"],
  ["Shipped", "shippedAt"],
  ["Delivered", "deliveredAt"],
  ["Cancelled", "cancelledAt"],
] as const;

export function OrderDetail({ o, showMoney, customerHref, actions, showLedger }: { o: Full; showMoney: boolean; customerHref?: string; actions: React.ReactNode; showLedger: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-navy">Order #{o.number}</h2>
        <Badge value={o.status} />
        {o.externalRef && <span className="text-sm text-gray-500">Ref {o.externalRef}</span>}
      </div>
      {actions}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm print:hidden">
        <Link href={`/s/${o.store.slug}/chat`} className="text-navy underline">Chat with {o.store.name}</Link>      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel p-3 lg:col-span-2">
          <h3 className="label">Items</h3>
          <ul className="divide-y divide-line">
            {o.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{i.product.name} <span className="text-gray-500">{i.product.strength}</span></div>
                  <div className="text-xs text-gray-400">{i.product.sku}{i.product.sourceCode ? ` · ${i.product.sourceCode}` : ""}{i.product.upc ? ` · UPC ${i.product.upc}` : ""}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div>× {i.qty}</div>
                  {showMoney && <div className="text-xs text-gray-500"><Money cents={i.unitPriceCents} /> ea</div>}
                </div>
              </li>
            ))}
          </ul>
          {showMoney && o.status !== "DRAFT" && (
            <dl className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
              <Row k="Subtotal" v={<Money cents={o.subtotalCents} />} />
              <Row k={`Discount ${o.discountBps / 100}%`} v={<Money cents={o.totalCents - o.subtotalCents} />} />
              <Row k={<b>Wholesale total</b>} v={<b><Money cents={o.totalCents} /></b>} />
              <Row k="From credit" v={<Money cents={o.creditAppliedCents} />} />
              {o.overageCents > 0 && <Row k={<span className="text-red">Overage (outstanding)</span>} v={<Money cents={o.overageCents} className="text-red" />} />}
              {o.shippingFeeCents != null && <Row k="Shipping (billed separately)" v={<Money cents={o.shippingFeeCents} />} />}
            </dl>
          )}
        </section>

        <div className="space-y-4">
          <section className="panel p-3 text-sm">
            <h3 className="label">Ship to</h3>
            <div className="font-medium">{o.shipName}</div>
            <div>{o.shipLine1}{o.shipLine2 ? `, ${o.shipLine2}` : ""}</div>
            <div>{o.shipCity}, {o.shipRegion} {o.shipPostalCode} · {o.shipCountry}</div>
            {o.customer.phone && <div className="text-gray-500">{o.customer.phone}</div>}
            {customerHref && <Link href={customerHref} className="mt-1 inline-block text-navy underline">{o.customer.email}</Link>}
            {o.trackingNo && (
              <div className="mt-2 border-t border-line pt-2">
                <span className="label">Tracking</span>
                {o.carrier} <b>{o.trackingNo}</b>
              </div>
            )}
          </section>
          <section className="panel p-3 text-sm">
            <h3 className="label">Timeline</h3>
            <ul className="space-y-1">
              {STEPS.filter(([, k]) => o[k]).map(([label, k]) => (
                <li key={k} className="flex justify-between"><span>{label}</span><span className="text-gray-500">{fmtDate(o[k])}</span></li>
              ))}
            </ul>
            {o.notes && <p className="mt-2 whitespace-pre-wrap border-t border-line pt-2 text-gray-600">{o.notes}</p>}
          </section>
        </div>
      </div>

      {showLedger && showMoney && o.ledger.length > 0 && (
        <section className="panel p-3">
          <h3 className="label">Ledger entries</h3>
          <ul className="divide-y divide-line text-sm">
            {o.ledger.map((e) => (
              <li key={e.id} className="flex justify-between py-1">
                <span>{e.type.replace("_", " ")} <span className="text-gray-400">· {e.bucket}</span></span>
                <Money cents={e.amountCents} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <div className="flex justify-between"><dt>{k}</dt><dd className="tabular-nums">{v}</dd></div>;
}
