import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { getBalances } from "@/lib/balances";
import { OrderForm } from "@/components/OrderForm";
import { PageHeader } from "@/components/ui";

export default async function EditDraftPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { store, canSeeMoney, canEdit } = await requireStore(slug);
  if (!canEdit) notFound();
  const o = await db.order.findUnique({ where: { id }, include: { items: true, customer: true } });
  if (!o || o.storeId !== store.id) notFound();
  if (o.status !== "DRAFT") redirect(`/s/${slug}/orders/${id}`);
  const [bal, lineProducts] = await Promise.all([getBalances(store.id), db.product.findMany({ where: { id: { in: o.items.map((i) => i.productId) } }, select: { id: true, sku: true, sourceCode: true, name: true, strength: true, basePriceCents: true } })]);
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit draft #${o.number}`} />
      <OrderForm
        storeId={store.id}
        slug={slug}
        lineProducts={lineProducts}
        hasCustomers={false}
        discountBps={store.discountBps}
        creditCents={bal.CREDIT}
        showMoney={canSeeMoney}
        draft={{
          id: o.id,
          items: o.items.map((i) => ({ productId: i.productId, qty: i.qty })),
          externalRef: o.externalRef ?? "",
          notes: o.notes ?? "",
          ship: {
            name: o.shipName,
            email: o.customer.email,
            phone: o.customer.phone ?? "",
            company: o.customer.company ?? "",
            line1: o.shipLine1,
            line2: o.shipLine2 ?? "",
            city: o.shipCity,
            region: o.shipRegion,
            postalCode: o.shipPostalCode,
            country: o.shipCountry,
          },
        }}
      />
    </div>
  );
}
