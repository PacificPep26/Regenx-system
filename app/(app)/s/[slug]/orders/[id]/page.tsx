import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireStore } from "@/lib/auth";
import { loadOrder, OrderDetail } from "@/components/OrderDetail";
import { OrderActions } from "@/components/OrderActions";
import { TopUpButton } from "@/components/TopUpButton";
import { db } from "@/lib/db";
import { formatUSD } from "@/lib/money";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { slug, id } = await params;
  const { err } = await searchParams;
  const { user, store, canSeePrices, canSeeMoney } = await requireStore(slug);
  const o = await loadOrder(id);
  if (!o || o.storeId !== store.id) notFound();
  const base = `/s/${slug}`;
  const waiting = o.status === "ON_HOLD" && user.role === "PARTNER_OWNER" ? (await db.topUpRequest.count({ where: { storeId: store.id, status: "REQUESTED" } })) > 0 : false;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <Link href={`${base}/orders`} className="text-navy"><ChevronLeft size={16} className="inline -mt-0.5" />Customer orders</Link>
      </div>
      {err && <p role="alert" className="mb-3 border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">Saved as draft, not submitted: {err}</p>}
      {o.status === "ON_HOLD" && canSeePrices && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">
          <span>On hold: over your credit by <b>{formatUSD(o.overageCents)}</b>. Add funds so the admin can approve it.</span>
          {user.role === "PARTNER_OWNER" && <TopUpButton storeId={store.id} suggested={o.overageCents} pending={waiting} />}
        </div>
      )}
      <OrderDetail
        o={o}
        showMoney={canSeePrices}
        gpFee={user.role === "FULFILLMENT"}
        showLedger={canSeeMoney}
        customerHref={`${base}/customers/${o.customerId}`}
        actions={<OrderActions orderId={o.id} status={o.status} role={user.role} editHref={`${base}/orders/${o.id}/edit`} listHref={`${base}/orders`} />}
      />
    </div>
  );
}
