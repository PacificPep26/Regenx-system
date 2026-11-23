import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { str, pageOf, flat, sortOf, dateRange, type SP } from "@/lib/query";
import { viewsFor } from "@/lib/views";
import { FilterBar } from "@/components/FilterBar";
import { Empty, Pager, fmtDate } from "@/components/ui";
import { US_STATES } from "@/lib/schemas";

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { user, store, canEdit } = await requireStore(slug);

  const and: Prisma.CustomerWhereInput[] = [{ storeId: store.id }];
  const q = str(sp, "q");
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    and.push({ OR: [{ name: c }, { email: c }, { phone: c }, { company: c }, { city: c }, { line1: c }, { postalCode: c }, { notes: c }, { tags: { has: q.toLowerCase() } }] });
  }
  const region = str(sp, "region");
  if (region) and.push({ region: region.toUpperCase() });
  const country = str(sp, "country");
  if (country) and.push({ country: country.toUpperCase() });
  const tag = str(sp, "tag");
  if (tag) and.push({ tags: { has: tag } });
  const has = str(sp, "orders");
  if (has === "yes") and.push({ orders: { some: {} } });
  if (has === "no") and.push({ orders: { none: {} } });
  const created = dateRange(sp, "from", "to");
  if (created) and.push({ createdAt: created });
  const where = { AND: and };

  const { page, skip, take } = pageOf(sp);
  const [rows, count, views, tagRows] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: sortOf(sp, ["name", "createdAt", "updatedAt"] as const, "name_asc"),
      skip,
      take,
      include: { _count: { select: { orders: true } } },
    }),
    db.customer.count({ where }),
    viewsFor(user.id, "customers", store.id),
    db.customer.findMany({ where: { storeId: store.id }, select: { tags: true } }),
  ]);
  const tags = [...new Set(tagRows.flatMap((t) => t.tags))].sort();

  return (
    <div>
      <FilterBar
        database="customers"
        storeId={store.id}
        views={views}
        fields={[
          { type: "search", key: "q", placeholder: "Search name, email, phone, address, tag…" },
          { type: "select", key: "region", label: "State", options: US_STATES.map((s) => ({ value: s, label: s })) },
          { type: "select", key: "country", label: "Country", options: [{ value: "US", label: "US" }, { value: "CA", label: "CA" }] },
          { type: "select", key: "tag", label: "Tag", options: tags.map((t) => ({ value: t, label: t })) },
          { type: "select", key: "orders", label: "Orders", options: [{ value: "yes", label: "Has orders" }, { value: "no", label: "No orders" }] },
          { type: "date", from: "from", to: "to", label: "Added" },
          { type: "select", key: "sort", label: "Sort", options: [
            { value: "name_asc", label: "Name A→Z" },
            { value: "name_desc", label: "Name Z→A" },
            { value: "createdAt_desc", label: "Newest" },
            { value: "updatedAt_desc", label: "Recently updated" },
          ] },
        ]}
        right={canEdit ? <Link href={`/s/${slug}/customers/new`} className="btn-primary">+ New customer</Link> : undefined}
      />
      <div className="mb-2 text-xs text-gray-500">{count} customer(s)</div>
      {!rows.length ? (
        <Empty>No customers match.</Empty>
      ) : (
        <>
          <ul className="divide-y divide-line border border-line md:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <Link href={`/s/${slug}/customers/${c.id}`} className="block p-3 active:bg-soft">
                  <div className="flex justify-between font-semibold text-navy"><span>{c.name}</span><span className="text-xs text-gray-500">{c._count.orders} orders</span></div>
                  <div className="text-sm">{c.email}{c.phone ? ` · ${c.phone}` : ""}</div>
                  <div className="text-xs text-gray-500">{c.city}, {c.region} {c.postalCode}{c.tags.length ? ` · ${c.tags.join(", ")}` : ""}</div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto border border-line md:block">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th><th className="th">Email</th><th className="th">Phone</th><th className="th">Location</th><th className="th">Tags</th><th className="th text-right">Orders</th><th className="th">Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-hover">
                    <td className="td font-semibold text-navy"><Link href={`/s/${slug}/customers/${c.id}`}>{c.name}</Link>{c.company && <div className="text-xs font-normal text-gray-500">{c.company}</div>}</td>
                    <td className="td">{c.email}</td>
                    <td className="td">{c.phone ?? "—"}</td>
                    <td className="td">{c.city}, {c.region} {c.postalCode}</td>
                    <td className="td text-xs">{c.tags.join(", ") || "—"}</td>
                    <td className="td text-right">{c._count.orders}</td>
                    <td className="td whitespace-nowrap">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
        </>
      )}
    </div>
  );
}
