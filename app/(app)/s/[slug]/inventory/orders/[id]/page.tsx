import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { InventoryActions } from "@/components/InventoryActions";
import { invBadge } from "@/lib/inventoryLabels";
import { Badge, Money, fmtDateTime } from "@/components/ui";

export default async function InventoryOrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { user, store, canSeePrices } = await requireStore(slug);
  const o = await db.inventoryOrder.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
  if (!o || o.storeId !== store.id) notFound();
  const base = `/s/${slug}/inventory`;
  const steps: [string, Date | null][] = [["Created", o.createdAt], ["Submitted", o.submittedAt], ["Approved", o.approvedAt], ["In your stock", o.receivedAt], ["Cancelled", o.cancelledAt]];
  return (
    <div className="space-y-4">
      <div className="text-sm"><Link href={base} className="text-navy"><ChevronLeft size={16} className="inline -mt-0.5" />Inventory</Link></div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-navy">Inventory order #{o.number}</h2>
        <Badge value={invBadge(o.status)} />
      </div>
      <InventoryActions id={o.id} status={o.status} role={user.role} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel p-3 lg:col-span-2">
          <h3 className="label">Items</h3>
          <ul className="divide-y divide-line">
            {o.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{i.product.name} <span className="text-gray-500">{i.product.strength}</span></div>
                  <div className="text-xs text-gray-400">{i.product.sku}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div>× {i.qty}</div>
                  {canSeePrices && <div className="text-xs text-gray-500"><Money cents={i.unitPriceCents} /> ea</div>}
                </div>
              </li>
            ))}
          </ul>
          {canSeePrices && o.status !== "DRAFT" && (
            <dl className="mt-2 space-y-1 border-t border-line pt-2 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd><Money cents={o.subtotalCents} /></dd></div>
              <div className="flex justify-between"><dt>Discount {o.discountBps / 100}%</dt><dd><Money cents={o.totalCents - o.subtotalCents} /></dd></div>
              <div className="flex justify-between"><dt><b>Inventory value</b></dt><dd><b><Money cents={o.totalCents} /></b></dd></div>
              <p className="pt-1 text-xs text-gray-500">Not charged now. Cost of goods is deducted when your customer orders are processed.</p>
            </dl>
          )}
        </section>
        <section className="panel p-3 text-sm">
          <h3 className="label">Timeline <span className="font-normal normal-case text-gray-400">(New York time)</span></h3>
          <ul className="space-y-1">
            {steps.filter(([, d]) => d).map(([label, d]) => (
              <li key={label} className="flex justify-between"><span>{label}</span><span className="text-gray-500">{fmtDateTime(d)}</span></li>
            ))}
          </ul>
          {o.notes && <p className="mt-2 whitespace-pre-wrap border-t border-line pt-2 text-gray-600">{o.notes}</p>}
        </section>
      </div>
    </div>
  );
}
