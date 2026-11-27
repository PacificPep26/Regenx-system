import Link from "next/link";
import { Badge, Money, Empty, fmtDate } from "./ui";
import { ORDER_STATUSES } from "@/lib/orderQuery";

export type OrderRow = {
  id: string;
  number: number;
  status: string;
  createdAt: Date;
  totalCents: number;
  shippingFeeCents: number | null;
  shipRegion: string;
  trackingNo: string | null;
  carrier: string | null;
  externalRef: string | null;
  customer: { name: string; email: string };
  store?: { name: string; slug: string };
  _count: { items: number };
};

export function OrderTable({ rows, href, showMoney, showStore }: { rows: OrderRow[]; href: (o: OrderRow) => string; showMoney: boolean; showStore?: boolean }) {
  if (!rows.length) return <Empty>No orders match.</Empty>;
  return (
    <>
      {/* mobile: cards */}
      <ul className="divide-y divide-line border border-line md:hidden">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={href(o)} className="block p-3 active:bg-soft">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-navy">#{o.number}{showStore && o.store ? ` · ${o.store.name}` : ""}</span>
                <Badge value={o.status} />
              </div>
              <div className="mt-1 flex justify-between text-sm">
                <span className="truncate">{o.customer.name}</span>
                <Money cents={o.totalCents} show={showMoney} className="font-semibold" />
              </div>
              {showMoney && o.shippingFeeCents != null && <div className="text-right text-xs text-gray-500">+ shipping <Money cents={o.shippingFeeCents} /></div>}
              <div className="mt-0.5 text-xs text-gray-500">
                {fmtDate(o.createdAt)} · {o._count.items} item(s) · {o.shipRegion}
                {o.trackingNo ? ` · ${o.carrier} ${o.trackingNo}` : ""}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {/* desktop: table */}
      <div className="hidden overflow-x-auto border border-line md:block">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">#</th>
              {showStore && <th className="th">Store</th>}
              <th className="th">Customer</th>
              <th className="th">Status</th>
              <th className="th">Created</th>
              <th className="th">Ship to</th>
              <th className="th">Ref</th>
              <th className="th">Tracking</th>
              <th className="th text-right">Goods</th>
              {showMoney && <th className="th text-right">Shipping</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="hover:bg-hover">
                <td className="td font-semibold text-navy"><Link href={href(o)}>#{o.number}</Link></td>
                {showStore && <td className="td">{o.store?.name}</td>}
                <td className="td"><Link href={href(o)} className="block">{o.customer.name}<div className="text-xs text-gray-500">{o.customer.email}</div></Link></td>
                <td className="td"><Badge value={o.status} /></td>
                <td className="td whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                <td className="td">{o.shipRegion}</td>
                <td className="td text-gray-500">{o.externalRef ?? "—"}</td>
                <td className="td text-xs">{o.trackingNo ? `${o.carrier} ${o.trackingNo}` : "—"}</td>
                <td className="td text-right font-semibold"><Money cents={o.totalCents} show={showMoney} /></td>
                {showMoney && <td className="td text-right text-gray-600"><Money cents={o.shippingFeeCents} /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function OrderBoard({ rows, href, showMoney, showStore, statuses = ORDER_STATUSES }: { rows: OrderRow[]; href: (o: OrderRow) => string; showMoney: boolean; showStore?: boolean; statuses?: readonly string[] }) {
  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      {statuses.map((s) => {
        const col = rows.filter((r) => r.status === s);
        return (
          <div key={s} className="w-[85vw] shrink-0 snap-start border border-line bg-soft sm:w-64">
            <div className="flex items-center justify-between border-b border-line bg-white px-2 py-2">
              <Badge value={s} />
              <span className="text-xs text-gray-500">{col.length}</span>
            </div>
            <div className="space-y-2 p-2">
              {col.map((o) => (
                <Link key={o.id} href={href(o)} className="block border border-line bg-white p-2 text-sm hover:border-navy">
                  <div className="flex justify-between font-semibold text-navy">
                    <span>#{o.number}</span>
                    <Money cents={o.totalCents} show={showMoney} />
                  </div>
                  <div className="truncate">{o.customer.name}</div>
                  {showMoney && o.shippingFeeCents != null && <div className="text-xs text-gray-500">+ shipping <Money cents={o.shippingFeeCents} /></div>}
                  <div className="text-xs text-gray-500">{showStore && o.store ? `${o.store.name} · ` : ""}{fmtDate(o.createdAt)}</div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const orderSelect = {
  id: true,
  number: true,
  status: true,
  createdAt: true,
  totalCents: true,
  shippingFeeCents: true,
  shipRegion: true,
  trackingNo: true,
  carrier: true,
  externalRef: true,
  customer: { select: { name: true, email: true } },
  store: { select: { name: true, slug: true } },
  _count: { select: { items: true } },
} as const;
