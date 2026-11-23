import Link from "next/link";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { customerWhere } from "@/lib/customerQuery";
import { pageOf, flat, sortOf, type SP } from "@/lib/query";
import { viewsFor } from "@/lib/views";
import { FilterBar } from "@/components/FilterBar";
import { Empty, Money, PageHeader, Pager, fmtDate } from "@/components/ui";
import { US_STATES } from "@/lib/schemas";

const LIVE = { status: { notIn: ["DRAFT", "CANCELLED"] as ("DRAFT" | "CANCELLED")[] } };

/** All customers across every store: stats + searchable list + CSV export (admin; GP read-only, no money). */
export default async function AllCustomers({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  const money = u.role === "ADMIN";
  const sp = await searchParams;
  const where = customerWhere(sp);
  const { page, skip, take } = pageOf(sp, 30);
  const since = new Date(Date.now() - 30 * 86400000);

  const [rows, count, stores, tagRows, withOrders, newer, byState, byStore] = await Promise.all([
    db.customer.findMany({ where, orderBy: sortOf(sp, ["name", "createdAt"] as const, "createdAt_desc"), skip, take, include: { store: { select: { name: true, slug: true } } } }),
    db.customer.count({ where }),
    db.store.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    db.customer.findMany({ select: { tags: true } }),
    db.customer.count({ where: { AND: [where, { orders: { some: LIVE } }] } }),
    db.customer.count({ where: { AND: [where, { createdAt: { gte: since } }] } }),
    db.customer.groupBy({ by: ["region"], where, _count: true, orderBy: { _count: { region: "desc" } }, take: 6 }),
    db.customer.groupBy({ by: ["storeId"], where, _count: true }),
  ]);

  const ids = rows.map((r) => r.id);
  const spend = await db.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, ...LIVE }, _sum: { totalCents: true }, _count: true, _max: { createdAt: true } });
  const sm = new Map(spend.map((s) => [s.customerId, s]));
  const tags = [...new Set(tagRows.flatMap((t) => t.tags))].sort();
  const storeName = new Map((await db.store.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const views = await viewsFor(u.id, "all-customers");
  const exportHref = "/api/customers/export?" + new URLSearchParams(Object.entries(flat(sp)).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();

  return (
    <div className="space-y-4">
      <PageHeader title="Customers · all stores" actions={money ? <a className="btn" href={exportHref}><Download size={16} /> Export CSV</a> : undefined} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="panel border-l-4 border-navy p-3"><div className="label mb-0">Customers</div><div className="text-lg font-bold">{count}</div></div>
        <div className="panel border-l-4 border-ok p-3"><div className="label mb-0">With orders</div><div className="text-lg font-bold">{withOrders}</div></div>
        <div className="panel border-l-4 border-navy p-3"><div className="label mb-0">New · 30 days</div><div className="text-lg font-bold">{newer}</div></div>
        <div className="panel border-l-4 border-red p-3">
          <div className="label mb-0">Top states</div>
          <div className="text-sm font-semibold">{byState.map((s) => `${s.region} ${s._count}`).join(" · ") || "—"}</div>
        </div>
      </div>
      <div className="text-xs text-gray-500">By store: {byStore.map((b) => `${storeName.get(b.storeId)} ${b._count}`).join(" · ") || "—"}</div>

      <FilterBar
        database="all-customers"
        views={views}
        fields={[
          { type: "search", key: "q", placeholder: "Search name, email, phone, address, store, tag…" },
          { type: "select", key: "store", label: "Store", options: stores.map((s) => ({ value: s.slug, label: s.name })) },
          { type: "select", key: "region", label: "State", options: US_STATES.map((s) => ({ value: s, label: s })) },
          { type: "select", key: "tag", label: "Tag", options: tags.map((t) => ({ value: t, label: t })) },
          { type: "select", key: "orders", label: "Orders", options: [{ value: "yes", label: "Has orders" }, { value: "no", label: "No orders" }] },
          { type: "date", from: "from", to: "to", label: "Added" },
          { type: "select", key: "sort", label: "Sort", options: [{ value: "createdAt_desc", label: "Newest" }, { value: "name_asc", label: "Name A–Z" }] },
        ]}
      />
      {!rows.length ? (
        <Empty>No customers match.</Empty>
      ) : (
        <>
          <ul className="divide-y divide-line border border-line md:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/s/${c.store.slug}/customers/${c.id}`} className="block p-3 active:bg-soft">
                  <div className="flex justify-between font-semibold text-navy"><span>{c.name}</span><span className="text-xs text-gray-500">{sm.get(c.id)?._count ?? 0} orders</span></div>
                  <div className="text-sm">{c.email}{c.phone ? ` · ${c.phone}` : ""}</div>
                  <div className="text-xs text-gray-500">{c.store.name} · {c.city}, {c.region}</div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto border border-line md:block">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr>
                  <th className="th">Customer</th><th className="th">Store</th><th className="th">Phone</th><th className="th">Address</th>
                  <th className="th text-right">Orders</th>{money && <th className="th text-right">Wholesale</th>}<th className="th">Last order</th><th className="th">Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = sm.get(c.id);
                  return (
                    <tr key={c.id} className="hover:bg-hover">
                      <td className="td"><Link href={`/s/${c.store.slug}/customers/${c.id}`} className="font-semibold text-navy">{c.name}</Link><div className="text-xs text-gray-500">{c.email}{c.company ? ` · ${c.company}` : ""}</div></td>
                      <td className="td">{c.store.name}</td>
                      <td className="td">{c.phone ?? "—"}</td>
                      <td className="td text-xs">{c.line1}{c.line2 ? `, ${c.line2}` : ""}<br />{c.city}, {c.region} {c.postalCode} {c.country}</td>
                      <td className="td text-right">{s?._count ?? 0}</td>
                      {money && <td className="td text-right"><Money cents={s?._sum.totalCents ?? 0} /></td>}
                      <td className="td whitespace-nowrap">{fmtDate(s?._max.createdAt)}</td>
                      <td className="td whitespace-nowrap">{fmtDate(c.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
        </>
      )}
    </div>
  );
}
