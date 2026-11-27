import Link from "next/link";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { orderWhere, orderSort, SORT_OPTIONS, statusOptions } from "@/lib/orderQuery";
import { pageOf, flat, str, type SP } from "@/lib/query";
import { viewsFor } from "@/lib/views";
import { FilterBar } from "@/components/FilterBar";
import { ViewToggle } from "@/components/ViewToggle";
import { OrderTable, OrderBoard, orderSelect } from "@/components/OrderViews";
import { Pager } from "@/components/ui";
import { US_STATES } from "@/lib/schemas";
import { newOrderCounts } from "@/lib/newOrders";
import { MarkOrdersSeen } from "@/components/MarkOrdersSeen";

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { user, store, canSeePrices, canEdit } = await requireStore(slug);
  const where = orderWhere(sp, { storeId: store.id });
  const board = str(sp, "view") === "board";
  const { page, skip, take } = pageOf(sp);
  const [rows, count, views, fresh] = await Promise.all([
    db.order.findMany({ where, orderBy: orderSort(sp), select: orderSelect, skip: board ? 0 : skip, take: board ? 300 : take }),
    db.order.count({ where }),
    viewsFor(user.id, "orders", store.id),
    newOrderCounts(user),
  ]);
  const href = (o: { id: string }) => `/s/${slug}/orders/${o.id}`;

  return (
    <div>
      <MarkOrdersSeen storeId={store.id} pending={fresh.get(store.id) ?? 0} />
      <FilterBar
        database="orders"
        storeId={store.id}
        views={views}
        fields={[
          { type: "search", key: "q", placeholder: "Search #, customer, email, SKU, tracking…" },
          { type: "multi", key: "status", label: "Status", options: statusOptions },
          { type: "date", from: "from", to: "to", label: "Created" },
          { type: "date", from: "sfrom", to: "sto", label: "Shipped" },
          ...(canSeePrices ? [{ type: "range" as const, min: "min", max: "max", label: "Total" }] : []),
          { type: "select", key: "region", label: "Ship state", options: US_STATES.map((s) => ({ value: s, label: s })) },
          { type: "select", key: "tracking", label: "Tracking", options: [{ value: "yes", label: "Has tracking" }, { value: "no", label: "No tracking" }] },
          { type: "select", key: "sort", label: "Sort", options: SORT_OPTIONS },
        ]}
        right={
          <>
            {canEdit && <Link href={`/s/${slug}/orders/new`} className="btn-primary">+ Add order</Link>}
            {canEdit && <Link href={`/s/${slug}/orders/import`} className="btn">Import CSV</Link>}
            <ViewToggle />
          </>
        }
      />
      <div className="mb-2 text-xs text-gray-500">{count} order(s)</div>
      {board ? (
        <OrderBoard rows={rows} href={href} showMoney={canSeePrices} />
      ) : (
        <>
          <OrderTable rows={rows} href={href} showMoney={canSeePrices} />
          <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
        </>
      )}
    </div>
  );
}
