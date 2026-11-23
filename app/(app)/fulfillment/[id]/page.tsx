import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadOrder, OrderDetail } from "@/components/OrderDetail";
import { OrderActions } from "@/components/OrderActions";
import { PrintButton } from "@/components/PrintButton";
import { stockLevels, emptyLevel } from "@/lib/stock";

export default async function FulfillmentOrder({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  const { id } = await params;
  const o = await loadOrder(id);
  if (!o || o.status === "DRAFT" || o.status === "ON_HOLD") notFound();
  const lv = await stockLevels(o.items.map((i) => i.productId));
  const check = o.items.map((i) => ({ i, l: lv.get(i.productId) ?? emptyLevel })).filter(({ i }) => i.product.trackStock);
  const blocked = o.status !== "SHIPPED" && o.status !== "DELIVERED" && check.some(({ i, l }) => l.onHand < i.qty);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm print:hidden">
        <Link href="/fulfillment" className="text-navy"><ChevronLeft size={16} className="inline -mt-0.5" />Fulfillment</Link>
        <PrintButton />
      </div>
      {/* packing slip header: partner branding */}
      <div className="mb-3 flex items-center gap-3 border-b-2 border-red pb-2">
        {o.store.brandingLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.store.brandingLogoUrl} alt="" className="h-10 w-auto" />
        )}
        <div className="font-bold text-navy">{o.store.name}</div>
      </div>
      {check.length > 0 && o.status !== "SHIPPED" && o.status !== "DELIVERED" && o.status !== "CANCELLED" && (
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
        showMoney={false}
        showLedger={false}
        actions={<div className="print:hidden"><OrderActions orderId={o.id} status={o.status} role={u.role} listHref="/fulfillment" /></div>}
      />
    </div>
  );
}
