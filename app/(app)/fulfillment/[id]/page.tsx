import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadOrder, OrderDetail } from "@/components/OrderDetail";
import { OrderActions } from "@/components/OrderActions";
import { PrintButton } from "@/components/PrintButton";
import { stockLevels, emptyLevel } from "@/lib/stock";
import { storeLevels, storeReserved } from "@/lib/storeStock";
import { db } from "@/lib/db";

export default async function FulfillmentOrder({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  const { id } = await params;
  const o = await loadOrder(id);
  if (!o || o.status === "DRAFT" || o.status === "ON_HOLD") notFound();
  const lv = await stockLevels(o.items.map((i) => i.productId));
  // inventory mode: the units come from this store's own stock at GP, so that is the stock GP has to check
  // (an order approved before the store switched to inventory mode has no reservation there and ships from the old stock)
  const fromStoreStock = o.store.inventoryMode && (await storeReserved(db, o.id)).size > 0;
  const inv = fromStoreStock || (o.store.inventoryMode && o.status === "SHIPPED") ? await storeLevels(db, o.storeId, o.items.map((i) => i.productId)) : null;
  const open = o.status !== "SHIPPED" && o.status !== "DELIVERED" && o.status !== "CANCELLED";
  const invBlocked = !!inv && open && o.items.some((i) => (inv.get(i.productId)?.onHand ?? 0) < i.qty);
  const check = o.items.map((i) => ({ i, l: lv.get(i.productId) ?? emptyLevel })).filter(({ i }) => i.product.trackStock);
  const blocked = o.status !== "SHIPPED" && o.status !== "DELIVERED" && check.some(({ i, l }) => l.onHand < i.qty);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm print:hidden">
        <Link href={u.role === "FULFILLMENT" ? "/gp" : "/fulfillment"} className="text-navy">
          <ChevronLeft size={16} className="inline -mt-0.5" />{u.role === "FULFILLMENT" ? "Home" : "Fulfillment"}
        </Link>
        <PrintButton />
      </div>
      {/* packing slip header: partner branding */}
      <div className="mb-3 flex items-center gap-3 border-b-2 border-red pb-2">
        {o.store.brandingLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.store.brandingLogoUrl} alt="" className="h-10 w-auto" />
        )}
        <div className="font-bold text-navy">{o.store.name}</div>
        {o.store.tier === "PREMIUM" && <span className="border border-red px-1.5 text-[10px] font-bold uppercase text-red">Priority</span>}
      </div>
      {o.store.labelNotes && (
        <section className="mb-3 border-l-4 border-navy bg-white p-3 text-sm">
          <h3 className="label">Branding / labeling instructions</h3>
          <p className="whitespace-pre-wrap">{o.store.labelNotes}</p>
        </section>
      )}
      {inv && (
        <section className={`mb-3 border p-3 text-sm print:hidden ${invBlocked ? "border-red bg-red/5" : "border-line bg-white"}`}>
          <h3 className="label">{o.store.name} stock at GP{open ? (invBlocked ? " · not enough to ship" : " · ready to ship") : ""}</h3>
          <ul className="divide-y divide-line">
            {o.items.map((i) => {
              const have = inv.get(i.productId)?.onHand ?? 0;
              return (
                <li key={i.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="min-w-0 truncate">{i.product.name} <span className="text-gray-500">{i.product.strength}</span></span>
                  <span className={`shrink-0 tabular-nums ${open && have < i.qty ? "font-bold text-red" : ""}`}>
                    {open ? `need ${i.qty} · in stock ${have}` : `shipped ${i.qty}`}{open && have >= i.qty ? ` → ${have - i.qty} after` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {!inv && check.length > 0 && o.status !== "SHIPPED" && o.status !== "DELIVERED" && o.status !== "CANCELLED" && (
        <section className={`mb-3 border p-3 text-sm print:hidden ${blocked ? "border-red bg-red/5" : "border-line bg-white"}`}>
          <h3 className="label">Stock check{blocked ? " · cannot ship yet" : " · ready"}</h3>
          <ul className="divide-y divide-line">
            {check.map(({ i, l }) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 truncate">{i.product.name} <span className="text-gray-500">{i.product.strength}</span></span>
                <span className={`shrink-0 tabular-nums ${l.onHand < i.qty ? "font-bold text-red" : ""}`}>need {i.qty} · on hand {l.onHand}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <OrderDetail
        o={o}
        showMoney={u.role === "ADMIN"}
        gpFee={u.role === "FULFILLMENT"}
        showLedger={false}
        actions={<div className="print:hidden"><OrderActions orderId={o.id} status={o.status} role={u.role} listHref={u.role === "FULFILLMENT" ? "/gp" : "/fulfillment"} /></div>}
      />
    </div>
  );
}
