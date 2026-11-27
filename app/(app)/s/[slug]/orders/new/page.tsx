import { notFound } from "next/navigation";
import { requireStore } from "@/lib/auth";
import { getBalances } from "@/lib/balances";
import { OrderForm } from "@/components/OrderForm";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";

export default async function NewOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store, canSeeMoney, canEdit } = await requireStore(slug);
  if (!canEdit) notFound();
  const [hasCustomers, bal] = await Promise.all([db.customer.count({ where: { storeId: store.id }, take: 1 }).then((n) => n > 0), getBalances(store.id)]);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Add order" />
      <OrderForm
        inventoryMode={store.inventoryMode}
        storeId={store.id}
        slug={slug}
        hasCustomers={hasCustomers}
        discountBps={store.discountBps}
        creditCents={bal.CREDIT}
        showMoney={canSeeMoney}
      />
    </div>
  );
}
