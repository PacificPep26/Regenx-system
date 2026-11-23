import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { requireStore } from "@/lib/auth";
import { loadOrder, OrderDetail } from "@/components/OrderDetail";
import { OrderActions } from "@/components/OrderActions";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { slug, id } = await params;
  const { err } = await searchParams;
  const { user, store, canSeePrices, canSeeMoney } = await requireStore(slug);
  const o = await loadOrder(id);
  if (!o || o.storeId !== store.id) notFound();
  const base = `/s/${slug}`;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <Link href={`${base}/orders`} className="text-navy"><ChevronLeft size={16} className="inline -mt-0.5" />Orders</Link>
        <Link href={`${base}/chat?order=${o.id}`} className="btn h-8">Message about this order</Link>
      </div>
      {err && <p role="alert" className="mb-3 border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">Saved as draft, not submitted: {err}</p>}
      <OrderDetail
        o={o}
        showMoney={canSeePrices}
        showLedger={canSeeMoney}
        customerHref={`${base}/customers/${o.customerId}`}
        actions={<OrderActions orderId={o.id} status={o.status} role={user.role} editHref={`${base}/orders/${o.id}/edit`} listHref={`${base}/orders`} />}
      />
    </div>
  );
}
