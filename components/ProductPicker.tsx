"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Minus, Plus, Search, X } from "lucide-react";
import { formatUSD } from "@/lib/money";
import type { PickProduct } from "./OrderForm";

type Item = PickProduct & { hits?: number; flag?: "out" | "low" | null; available?: number | null };
type Page = { popular: Item[]; items: Item[]; hasMore: boolean };

/**
 * Modal catalog backed by server-side search (/api/store/[slug]/products): only one page of matches is ever
 * loaded, so a catalog of any size stays fast. Products this store orders most lead the empty-search view.
 */
export function ProductPicker({
  slug,
  chosen,
  qty,
  setQty,
  net,
  showMoney,
  stockOnly,
  onClose,
}: {
  slug: string;
  chosen: Map<string, PickProduct>; // everything already in the order (needed for the "Selected" view)
  qty: Map<string, number>;
  setQty: (p: PickProduct, n: number) => void;
  net: (cents: number) => number;
  showMoney: boolean;
  /** inventory mode: list only what the store has in its own stock */
  stockOnly?: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [onlyChosen, setOnlyChosen] = useState(false);
  const [popular, setPopular] = useState<Item[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0); // ignore responses that arrive out of order

  const load = useCallback(async (text: string, p: number) => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const r = await fetch(`/api/store/${slug}/products?q=${encodeURIComponent(text)}&page=${p}${stockOnly ? "&stock=1" : ""}`, { cache: "no-store" });
      if (!r.ok || my !== seq.current) return;
      const d: Page = await r.json();
      setPopular(p === 0 ? d.popular : []);
      setItems((prev) => (p === 0 ? d.items : [...prev, ...d.items]));
      setHasMore(d.hasMore);
      setPage(p);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [slug, stockOnly]);

  useEffect(() => {
    const t = setTimeout(() => load(q.trim(), 0), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  useEffect(() => {
    input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const nChosen = [...qty.values()].filter(Boolean).length;
  const units = [...qty.values()].reduce((s, n) => s + n, 0);
  const selected: Item[] = [...chosen.values()].filter((p) => qty.get(p.id)).sort((a, b) => a.name.localeCompare(b.name));

  const row = (p: Item) => {
    const n = qty.get(p.id) ?? 0;
    return (
      <li key={p.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${n ? "bg-red/5" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{p.name} <span className="font-normal text-gray-500">{p.strength}</span></div>
          <div className="mt-0.5 flex items-center gap-x-2 text-xs text-gray-400">
            {p.available != null ? (
              // inventory mode: what is left, live as the quantity changes
              <span className={`shrink-0 font-semibold ${p.available - n <= 0 ? "text-red" : "text-navy"}`}>
                {n ? `${p.available - n} left of ${p.available}` : `${p.available} in stock`}
              </span>
            ) : (
              <span className="hidden truncate sm:inline">{p.sku}</span>
            )}
            {!stockOnly && p.flag && (
              <span className={`shrink-0 border px-1 text-[10px] font-semibold uppercase ${p.flag === "out" ? "border-red text-red" : "border-warn text-warn"}`}>
                {p.flag === "out" ? "out" : "low"}
              </span>
            )}
            {!!p.hits && !stockOnly && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-red"><Flame size={11} /> {p.hits}×</span>
            )}
          </div>
        </div>
        {showMoney && <div className="shrink-0 text-right text-xs font-semibold tabular-nums text-navy">{formatUSD(net(p.basePriceCents))}</div>}
        {n === 0 ? (
          <button type="button" className="btn h-9 w-9 px-0" aria-label={`Add ${p.name} ${p.strength}`} onClick={() => setQty(p, 1)}><Plus size={16} /></button>
        ) : (
          <div className="flex items-center">
            <button type="button" className="btn h-9 w-9 px-0" aria-label="Decrease" onClick={() => setQty(p, n - 1)}><Minus size={14} /></button>
            <input className="input h-9 w-14 text-center" inputMode="numeric" value={n} onChange={(e) => setQty(p, parseInt(e.target.value) || 0)} aria-label={`Quantity ${p.name} ${p.strength}`} />
            <button type="button" className="btn h-9 w-9 px-0" aria-label="Increase" onClick={() => setQty(p, n + 1)}><Plus size={14} /></button>
          </div>
        )}
      </li>
    );
  };

  const heading = (text: string, icon?: React.ReactNode) => (
    <li className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-soft px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{icon}{text}</li>
  );

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Add products" onMouseDown={(e) => e.stopPropagation()} className="flex h-[92dvh] w-full flex-col border-t-4 border-t-navy bg-white sm:h-[85dvh] sm:max-w-2xl sm:border sm:border-line sm:border-t-navy">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h2 className="font-bold text-navy">Add products</h2>
          <button type="button" className="btn h-8 w-8 px-0" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="flex gap-2 border-b border-line p-3">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-3 text-gray-400" />
            <input ref={input} className="input pl-9" type="search" placeholder="Search name, strength, SKU, code…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button type="button" className={`btn ${onlyChosen ? "border-navy bg-navy text-white hover:bg-navy" : ""}`} onClick={() => setOnlyChosen(!onlyChosen)}>
            Selected{nChosen ? ` (${nChosen})` : ""}
          </button>
        </div>

        <ul className="flex-1 divide-y divide-line overflow-y-auto">
          {onlyChosen ? (
            <>
              {selected.map(row)}
              {!selected.length && <li className="p-6 text-center text-sm text-gray-500">Nothing selected yet.</li>}
            </>
          ) : (
            <>
              {popular.length > 0 && heading("Frequently ordered", <Flame size={12} className="text-red" />)}
              {popular.map(row)}
              {popular.length > 0 && heading("All products")}
              {items.map(row)}
              {!loading && !items.length && !popular.length && <li className="p-6 text-center text-sm text-gray-500">No products match.</li>}
              {loading && <li className="p-4 text-center text-xs text-gray-400">Loading…</li>}
              {hasMore && !loading && (
                <li className="p-3"><button type="button" className="btn w-full" onClick={() => load(q.trim(), page + 1)}>Show more</button></li>
              )}
            </>
          )}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-line bg-soft px-3 py-3">
          <span className="text-sm text-gray-600">{nChosen} product(s) · {units} unit(s)</span>
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
