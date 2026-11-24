import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { orderWhere, orderSort, SORT_OPTIONS } from "@/lib/orderQuery";
import { pageOf, flat, str, type SP } from "@/lib/query";
import { viewsFor } from "@/lib/views";
import { FilterBar } from "@/components/FilterBar";
import { ViewToggle } from "@/components/ViewToggle";
import { OrderTable, OrderBoard, orderSelect } from "@/components/OrderViews";
import { PageHeader, Pager } from "@/components/ui";
import { US_STATES } from "@/lib/schemas";

const FLOW = ["APPROVED", "PACKING", "SHIPPED", "DELIVERED"] as const;

export default async function FulfillmentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  const sp = await searchParams;
  // GP only ever sees orders that cleared credit; default to open work
  // GP only ever sees orders that cleared credit; admin also sees orders held for overage approval
  const flow: readonly string[] = u.role === "ADMIN" ? ["ON_HOLD", ...FLOW] : FLOW;
  const where = orderWhere(sp.status ? sp : { ...sp, status: "APPROVED,PACKING" }, { status: { in: flow as (typeof FLOW)[number][] } });
  const board = str(sp, "view") === "board";
  const { page, skip, take } = pageOf(sp);
  const [rows, count, stores, views] = await Promise.all([
    db.order.findMany({ where, orderBy: orderSort(sp.sort ? sp : { ...sp, sort: "createdAt_asc" }), select: orderSelect, skip: board ? 0 : skip, take: board ? 300 : take }),
    db.order.count({ where }),
    db.store.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    viewsFor(u.id, "fulfillment"),
  ]);
  return (
    <div>
      <PageHeader title="Fulfillment" />
      <FilterBar
        database="fulfillment"
        views={views}
        fields={[
          { type: "search", key: "q", placeholder: "Search #, store, customer, SKU, tracking…" },
          { type: "multi", key: "status", label: "Status", options: flow.map((s) => ({ value: s, label: s.replace("_", " ") })) },
          { type: "select", key: "store", label: "Store", options: stores.map((s) => ({ value: s.slug, label: s.name })) },
          { type: "date", from: "from", to: "to", label: "Created" },
          { type: "date", from: "sfrom", to: "sto", label: "Shipped" },
          { type: "select", key: "region", label: "Ship state", options: US_STATES.map((s) => ({ value: s, label: s })) },
          { type: "select", key: "carrier", label: "Carrier", options: ["USPS", "UPS", "FedEx", "DHL"].map((c) => ({ value: c, label: c })) },
          { type: "select", key: "sort", label: "Sort", options: SORT_OPTIONS },
        ]}
        right={<ViewToggle />}
      />
      <div className="mb-2 text-xs text-gray-500">{count} order(s)</div>
      {board ? (
        <OrderBoard rows={rows} href={(o) => `/fulfillment/${o.id}`} showMoney={u.role === "ADMIN"} showStore statuses={flow} />
      ) : (
        <>
          <OrderTable rows={rows} href={(o) => `/fulfillment/${o.id}`} showMoney={u.role === "ADMIN"} showStore />
          <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
        </>
      )}
    </div>
  );
}
