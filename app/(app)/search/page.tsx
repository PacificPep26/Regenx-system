import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isPartner } from "@/lib/auth";
import { orderWhere } from "@/lib/orderQuery";
import { str, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { OrderTable, orderSelect } from "@/components/OrderViews";
import { PageHeader } from "@/components/ui";

/** One box across orders, customers, products (and stores for admin), scoped by role. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const q = str(sp, "q");
  const partner = isPartner(u);
  const storeScope = partner ? { storeId: u.storeId ?? "-" } : {};
  const showMoney = !(u.role === "PARTNER_STAFF" && u.store?.hideAmountsFromStaff);
  const c = q ? { contains: q, mode: "insensitive" as const } : undefined;

  const [orders, customers, products, stores] = q
    ? await Promise.all([
        db.order.findMany({
          where: orderWhere({ q }, u.role === "FULFILLMENT" ? { status: { in: ["APPROVED", "PACKING", "SHIPPED", "DELIVERED"] } } : storeScope),
          orderBy: { createdAt: "desc" },
          take: 20,
          select: orderSelect,
        }),
        u.role === "FULFILLMENT"
          ? []
          : db.customer.findMany({
              where: { ...storeScope, OR: [{ name: c }, { email: c }, { phone: c }, { city: c }, { company: c }] },
              take: 20,
              include: { store: { select: { slug: true, name: true } } },
            }),
        db.product.findMany({
          where: {
            OR: [{ name: c }, { sku: c }, { sourceCode: c }],
            ...(partner ? { active: true, ...(u.store?.allowRestricted ? {} : { restricted: false }) } : {}),
          },
          take: 20,
        }),
        u.role === "ADMIN" ? db.store.findMany({ where: { OR: [{ name: c }, { slug: c }] }, take: 10 }) : [],
      ])
    : [[], [], [], []];

  const orderHref = (o: { id: string; store?: { slug: string } }) => (u.role === "FULFILLMENT" ? `/fulfillment/${o.id}` : `/s/${o.store?.slug}/orders/${o.id}`);

  return (
    <div className="space-y-4">
      <PageHeader title="Search" />
      <FilterBar fields={[{ type: "search", key: "q", placeholder: "Order #, customer, email, phone, SKU, tracking, store…" }]} />
      {!q && <p className="text-sm text-gray-500">Type to search.</p>}
      {stores.length > 0 && (
        <section>
          <h2 className="label mb-2">Stores</h2>
          <ul className="divide-y divide-line border border-line">
            {stores.map((s) => <li key={s.id}><Link className="block p-3 font-semibold text-navy hover:bg-hover" href={`/s/${s.slug}/orders`}>{s.name}</Link></li>)}
          </ul>
        </section>
      )}
      {q && (
        <section>
          <h2 className="label mb-2">Orders ({orders.length})</h2>
          <OrderTable rows={orders} href={orderHref} showMoney={showMoney} showStore={!partner} />
        </section>
      )}
      {customers.length > 0 && (
        <section>
          <h2 className="label mb-2">Customers ({customers.length})</h2>
          <ul className="divide-y divide-line border border-line">
            {customers.map((x) => (
              <li key={x.id}>
                <Link className="block p-3 hover:bg-hover" href={`/s/${x.store.slug}/customers/${x.id}`}>
                  <span className="font-semibold text-navy">{x.name}</span> <span className="text-sm text-gray-500">{x.email} · {x.city}, {x.region}{!partner ? ` · ${x.store.name}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {products.length > 0 && (
        <section>
          <h2 className="label mb-2">Products ({products.length})</h2>
          <ul className="divide-y divide-line border border-line">
            {products.map((p) => (
              <li key={p.id}>
                <Link className="block p-3 text-sm hover:bg-hover" href={`/catalog?q=${encodeURIComponent(p.sku)}`}>
                  <b>{p.name}</b> {p.strength} <span className="text-xs text-gray-400">{p.sku}{p.sourceCode ? ` · ${p.sourceCode}` : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
