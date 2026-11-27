"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatUSD } from "@/lib/money";
import { createInventoryOrder } from "@/app/actions/inventory";
import { ProductPicker } from "./ProductPicker";
import type { PickProduct } from "./OrderForm";

type Line = { productId: string; qty: number };

/** Inventory order: pick products and quantities for the store's own stock (no customer, no address). */
export function InventoryForm({ storeId, slug, discountBps, creditCents, onDone }: { storeId: string; slug: string; discountBps: number; creditCents: number; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<Line[]>([]);
  const [catalog, setCatalog] = useState<Map<string, PickProduct>>(new Map());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [picking, setPicking] = useState(false);

  const net = (c: number) => Math.round((c * (10000 - discountBps)) / 10000);
  const subtotal = lines.reduce((s, l) => s + (catalog.get(l.productId)?.basePriceCents ?? 0) * l.qty, 0);
  const total = net(subtotal);
  const qtyMap = useMemo(() => new Map(lines.map((l) => [l.productId, l.qty])), [lines]);
  const setQty = (p: PickProduct, n: number) => {
    setCatalog((m) => (m.has(p.id) ? m : new Map(m).set(p.id, p)));
    setLines((ls) => {
      const next = Math.max(0, Math.min(1_000_000, Math.floor(n) || 0));
      if (next === 0) return ls.filter((l) => l.productId !== p.id);
      return ls.some((l) => l.productId === p.id) ? ls.map((l) => (l.productId === p.id ? { ...l, qty: next } : l)) : [...ls, { productId: p.id, qty: next }];
    });
  };

  const save = (submit: boolean) => {
    setError(undefined);
    start(async () => {
      const r = await createInventoryOrder({ storeId, items: lines, notes: notes || undefined, submit });
      if (r.error) {
        setError(r.error);
        if (r.id) router.push(`/s/${slug}/inventory/orders/${r.id}`); // a draft was kept: let the store fix it there
      } else if (onDone) onDone();
      else if (r.id) router.push(`/s/${slug}/inventory/orders/${r.id}`);
    });
  };

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      <section className="panel p-3 md:p-4">
        <h2 className="mb-3 font-semibold text-navy">Products for your inventory</h2>
        <button type="button" className="btn-primary mb-3 w-full sm:w-auto" onClick={() => setPicking(true)}>
          <Plus size={16} /> Add products{lines.length ? ` (${lines.length})` : ""}
        </button>
        {picking && <ProductPicker slug={slug} chosen={catalog} qty={qtyMap} setQty={setQty} net={net} showMoney onClose={() => setPicking(false)} />}
        <ul className="divide-y divide-line border border-line">
          {lines.map((l) => {
            const p = catalog.get(l.productId);
            if (!p) return null;
            return (
              <li key={l.productId} className="space-y-2 p-2 text-sm sm:flex sm:items-center sm:gap-2 sm:space-y-0">
                <div className="min-w-0 sm:flex-1">
                  <div className="font-medium">{p.name} <span className="text-gray-500">{p.strength}</span></div>
                  <div className="break-all text-xs text-gray-400">{p.sku}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                <div className="flex items-center">
                  <button type="button" className="btn h-9 w-9 px-0" aria-label="Decrease" onClick={() => setQty(p, l.qty - 1)}><Minus size={16} /></button>
                  <input className="input h-9 w-16 text-center" inputMode="numeric" value={l.qty} onChange={(e) => setQty(p, parseInt(e.target.value) || 1)} />
                  <button type="button" className="btn h-9 w-9 px-0" aria-label="Increase" onClick={() => setQty(p, l.qty + 1)}><Plus size={16} /></button>
                </div>
                <span className="flex items-center gap-2">
                  <span className="min-w-[4.5rem] text-right tabular-nums">{formatUSD(net(p.basePriceCents * l.qty))}</span>
                  <button type="button" className="btn h-9 px-2 text-red" aria-label="Remove" onClick={() => setQty(p, 0)}><Trash2 size={16} /></button>
                </span>
                </div>
              </li>
            );
          })}
          {!lines.length && <li className="p-3 text-sm text-gray-500">No products yet.</li>}
        </ul>
      </section>
      <section className="panel p-3 md:p-4">
        <label className="label">Notes</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </section>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-navy bg-white px-3 py-2 md:static md:border md:border-line md:p-3">
        {error && <p role="alert" className="mb-2 border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs md:text-sm">
            <div>Cost of goods <b className="tabular-nums">{formatUSD(total)}</b></div>
            <div className={creditCents - total < 0 ? "text-red" : "text-gray-500"}>
              Credit after: {formatUSD(creditCents - total)}
              {creditCents - total < 0 && <span className="hidden sm:inline"> · held for approval, add funds</span>}
            </div>
          </div>
          <button className="btn-primary shrink-0" disabled={pending || !lines.length} onClick={() => save(true)}>{pending ? "Adding…" : "Add to inventory"}</button>
        </div>
      </div>
    </div>
  );
}
