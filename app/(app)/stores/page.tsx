import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { str, list, one, pageOf, flat, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { NewStoreForm } from "./NewStoreForm";
import { Badge, Empty, Money, PageHeader, Pager, fmtDate } from "@/components/ui";

const SORTS = {
  name: { name: "asc" },
  newest: { createdAt: "desc" },
  attention: [{ outstandingCents: "desc" }, { creditCents: "asc" }],
  credit_low: { creditCents: "asc" },
  outstanding: { outstandingCents: "desc" },
} as const satisfies Record<string, Prisma.StoreOrderByWithRelationInput | Prisma.StoreOrderByWithRelationInput[]>;

/** All stores, paginated and filtered in the database so hundreds of stores stay manageable. Admin manages; GP browses (no money). */
export default async function StoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireRole("ADMIN", "FULFILLMENT");
  const admin = me.role === "ADMIN";
  const sp = await searchParams;
  const q = str(sp, "q");
  const status = list(sp, "status", ["PENDING", "ACTIVE", "SUSPENDED"] as const);
  const tier = list(sp, "tier", ["STARTER", "PREMIUM"] as const);
  const sortKey = one(sp, "sort", Object.keys(SORTS) as (keyof typeof SORTS)[]) ?? (admin ? "attention" : "name");
  const attention = str(sp, "attention");

  const where: Prisma.StoreWhereInput = {
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, ...(admin ? [{ users: { some: { email: { contains: q, mode: "insensitive" as const } } } }] : [])] } : {}),
    ...(status ? { status: { in: status } } : {}),
    ...(tier ? { tier: { in: tier } } : {}),
    ...(admin && attention === "yes" ? { OR: [{ outstandingCents: { gt: 0 } }, { statements: { some: { status: "OVERDUE" } } }] } : {}),
  };
  const { page, skip, take } = pageOf(sp, 25);
  const [stores, count] = await Promise.all([
    db.store.findMany({ where, orderBy: SORTS[sortKey] as Prisma.StoreOrderByWithRelationInput, skip, take }),
    db.store.count({ where }),
  ]);
  const ids = stores.map((s) => s.id);
  const [orders, customers] = await Promise.all([
    db.order.groupBy({ by: ["storeId"], where: { storeId: { in: ids } }, _count: true }),
    db.customer.groupBy({ by: ["storeId"], where: { storeId: { in: ids } }, _count: true }),
  ]);
  const oc = new Map(orders.map((r) => [r.storeId, r._count]));
  const cc = new Map(customers.map((r) => [r.storeId, r._count]));

  return (
    <div className="space-y-4">
      <PageHeader title={`Stores · ${count}`} />
      <FilterBar
        fields={[
          { type: "search", key: "q", placeholder: admin ? "Search store, slug, user email…" : "Search store or slug…" },
          { type: "multi", key: "status", label: "Status", options: ["PENDING", "ACTIVE", "SUSPENDED"].map((s) => ({ value: s, label: s })) },
          { type: "multi", key: "tier", label: "Tier", options: [{ value: "STARTER", label: "Starter" }, { value: "PREMIUM", label: "Premium" }] },
          ...(admin ? [{ type: "select" as const, key: "attention", label: "Money", options: [{ value: "yes", label: "Needs attention (owes / overdue)" }] }] : []),
          { type: "select", key: "sort", label: "Sort", options: [
            { value: "name", label: "Name A–Z" }, { value: "newest", label: "Newest" },
            ...(admin ? [{ value: "attention", label: "Needs attention first" }, { value: "credit_low", label: "Lowest credit" }, { value: "outstanding", label: "Highest outstanding" }] : []),
          ] },
        ]}
      />
      {!stores.length ? (
        <Empty>No stores match.</Empty>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {stores.map((s) => (
            <li key={s.id}>
              <Link href={admin ? `/s/${s.slug}/settings` : `/s/${s.slug}/orders`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-hover">
                <span className="font-semibold text-navy">{s.name} <span className="text-xs font-normal text-gray-400">/{s.slug}</span></span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  {admin && <span>credit <b><Money cents={s.creditCents} /></b></span>}
                  {admin && s.outstandingCents > 0 && <span className="text-red">owes <b><Money cents={s.outstandingCents} /></b></span>}
                  <span>{oc.get(s.id) ?? 0} orders · {cc.get(s.id) ?? 0} customers · since {fmtDate(s.createdAt)}</span>
                  <Badge value={s.tier} /> <Badge value={s.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
      {admin && (
        <section className="panel max-w-2xl p-3 md:p-4">
          <h2 className="label mb-3">New store</h2>
          <NewStoreForm />
        </section>
      )}
    </div>
  );
}
