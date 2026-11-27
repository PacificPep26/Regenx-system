"use client";

import { Minus, Plus, Trash2 } from "lucide-react";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrder, updateDraft, submitOrder } from "@/app/actions/orders";
import { CustomerFields } from "./CustomerFields";
import { ProductPicker } from "./ProductPicker";
import { formatUSD } from "@/lib/money";
import type { CustomerInput } from "@/lib/schemas";

export type PickProduct = { id: string; sku: string; sourceCode: string | null; name: string; strength: string; basePriceCents: number; /** inventory mode: units the store has left */ available?: number | null };
export type PickCustomer = { id: string; name: string; email: string; city: string; region: string };
type Line = { productId: string; qty: number };
type Cust = Record<string, string>;

const EMPTY: Cust = { name: "", email: "", phone: "", company: "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "US", notes: "", tags: "" };

export function OrderForm({
  storeId,
  slug,
  lineProducts = [],
  hasCustomers,
  discountBps,
  creditCents,
  showMoney,
  inventoryMode,
  draft,
}: {
  storeId: string;
  slug: string;
  /** only the products already on a draft; the catalog itself is searched on the server */
  lineProducts?: PickProduct[];
  hasCustomers: boolean;
  discountBps: number;
  creditCents: number;
  showMoney: boolean;
  /** the store fills customer orders from its own inventory: only stocked products, no goods charge */
  inventoryMode?: boolean;
  draft?: { id: string; items: Line[]; ship: Cust; externalRef: string; notes: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<Line[]>(draft?.items ?? []);
  const [mode, setMode] = useState<"existing" | "new">(draft ? "new" : hasCustomers ? "existing" : "new");
  const [customerId, setCustomerId] = useState("");
  const [custQ, setCustQ] = useState("");
  const [custItems, setCustItems] = useState<PickCustomer[]>([]);
  const [custLoading, setCustLoading] = useState(false);
  const [catalog, setCatalog] = useState<Map<string, PickProduct>>(() => new Map(lineProducts.map((p) => [p.id, p])));
  const [cust, setCust] = useState<Cust>(draft?.ship ?? EMPTY);
  const [externalRef, setExternalRef] = useState(draft?.externalRef ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [error, setError] = useState<string>();
  const [picking, setPicking] = useState(false);

  const byId = catalog;
  const net = (c: number) => Math.round((c * (10000 - discountBps)) / 10000);
  const subtotal = lines.reduce((s, l) => s + (byId.get(l.productId)?.basePriceCents ?? 0) * l.qty, 0);
  const total = net(subtotal);

  const qtyMap = useMemo(() => new Map(lines.map((l) => [l.productId, l.qty])), [lines]);
  const setQty = (p: PickProduct, n: number) => {
    const id = p.id;
    setCatalog((m) => (m.has(id) ? m : new Map(m).set(id, p)));
    setLines((ls) => {
      const next = Math.max(0, Math.min(p.available ?? 1_000_000, Math.floor(n) || 0));
      if (next === 0) return ls.filter((l) => l.productId !== id);
      return ls.some((l) => l.productId === id) ? ls.map((l) => (l.productId === id ? { ...l, qty: next } : l)) : [...ls, { productId: id, qty: next }];
    });
  };

  useEffect(() => {
    if (mode !== "existing" || draft) return;
    let live = true;
    const t = setTimeout(async () => {
      setCustLoading(true);
      try {
        const r = await fetch(`/api/store/${slug}/customers?q=${encodeURIComponent(custQ.trim())}`, { cache: "no-store" });
        if (r.ok && live) setCustItems((await r.json()).items);
      } finally {
        if (live) setCustLoading(false);
      }
    }, custQ ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [custQ, mode, slug, draft]);
  const custMatches = custItems;

  const save = (submit: boolean) => {
    setError(undefined);
    start(async () => {
      const r = draft
        ? await updateDraft(draft.id, { items: lines, ship: cust as CustomerInput, externalRef, notes })
        : await createOrder({
            storeId,
            items: lines,
            submit,
            externalRef,
            notes,
            ...(mode === "existing" ? { customerId } : { customer: cust as CustomerInput }),
          });
      if (r.error && !r.id) return setError(r.error);
      if (draft && submit) {
        const s = await submitOrder(draft.id);
        if (s.error) return setError(s.error);
      }
      // a submit failure on a new order still leaves a saved draft; its page shows why
      router.push(`/s/${slug}/orders/${r.id ?? draft!.id}${r.error ? `?err=${encodeURIComponent(r.error)}` : ""}`);
    });
  };

  return (
    <div className="space-y-4 pb-28 md:pb-0">
      {/* Customer */}
      <section className="panel p-3 md:p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-navy">{draft ? "Ship to" : "Customer"}</h2>
          {!draft && hasCustomers && (
            <div className="flex">
              {(["existing", "new"] as const).map((m) => (
                <button key={m} type="button" className={`btn h-8 text-xs ${mode === m ? "border-navy bg-navy text-white hover:bg-navy" : ""}`} onClick={() => setMode(m)}>
                  {m === "existing" ? "Existing" : "New"}
                </button>
              ))}
            </div>
          )}
        </div>
        {mode === "existing" && !draft ? (
          <div>
            <input className="input mb-2" type="search" placeholder="Search name, email, city…" value={custQ} onChange={(e) => setCustQ(e.target.value)} />
            <ul className="max-h-64 divide-y divide-line overflow-y-auto border border-line">
              {custMatches.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setCustomerId(c.id)} className={`block w-full px-3 py-2 text-left text-sm ${customerId === c.id ? "bg-navy text-white" : "hover:bg-hover"}`}>
                    <div className="font-medium">{c.name}</div>
                    <div className={`text-xs ${customerId === c.id ? "text-white/80" : "text-gray-500"}`}>{c.email} · {c.city}, {c.region}</div>
                  </button>
                </li>
              ))}
              {custLoading && <li className="p-3 text-xs text-gray-400">Loading…</li>}
              {!custLoading && !custMatches.length && <li className="p-3 text-sm text-gray-500">No match.</li>}
            </ul>
          </div>
        ) : (
          <CustomerFields values={cust} onChange={(k, v) => setCust((c) => ({ ...c, [k]: v }))} withMeta={!draft} />
        )}
      </section>

      {/* Products */}
      <section className="panel p-3 md:p-4">
        <h2 className="mb-3 font-semibold text-navy">Products</h2>
        <button type="button" className="btn-primary mb-3 w-full sm:w-auto" onClick={() => setPicking(true)}>
          <Plus size={16} /> Add products{lines.length ? ` (${lines.length})` : ""}
        </button>
        {picking && <ProductPicker slug={slug} chosen={catalog} qty={qtyMap} setQty={setQty} net={net} showMoney={showMoney} stockOnly={inventoryMode} onClose={() => setPicking(false)} />}
        <ul className="divide-y divide-line border border-line">
          {lines.map((l) => {
            const p = byId.get(l.productId);
            if (!p) return null;
            return (
              <li key={l.productId} className="space-y-2 p-2 text-sm sm:flex sm:items-center sm:gap-2 sm:space-y-0">
                <div className="min-w-0 sm:flex-1">
                  <div className="font-medium">{p.name} <span className="text-gray-500">{p.strength}</span></div>
                  <div className="break-all text-xs text-gray-400">{p.sku}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                <div className="flex items-center">
                  <button type="button" className="btn h-9 w-9 px-0" aria-label="Decrease" onClick={() => setLines((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}><Minus size={16} /></button>
                  <input
                    className="input h-9 w-14 text-center"
                    inputMode="numeric"
                    value={l.qty}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(p.available ?? 1_000_000, parseInt(e.target.value) || 1));
                      setLines((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, qty: n } : x)));
                    }}
                  />
                  <button type="button" className="btn h-9 w-9 px-0" aria-label="Increase" onClick={() => setLines((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, qty: Math.min(p.available ?? 1_000_000, x.qty + 1) } : x)))}><Plus size={16} /></button>
                </div>
                <span className="flex items-center gap-2">
                  {showMoney && <span className="min-w-[4.5rem] text-right tabular-nums">{formatUSD(net(p.basePriceCents * l.qty))}</span>}
                  <button type="button" className="btn h-9 px-2 text-red" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}><Trash2 size={16} /></button>
                </span>
                </div>
              </li>
            );
          })}
          {!lines.length && <li className="p-3 text-sm text-gray-500">No products yet.</li>}
        </ul>
      </section>

      <section className="panel grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 md:p-4">
        <div>
          <label className="label">Your order ref</label>
          <input className="input" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="e.g. WEB-10023" />
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </section>

      {/* sticky summary bar (mobile bottom, desktop inline) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-navy bg-white px-3 py-2 md:static md:border md:border-line md:p-3">
        {error && <p role="alert" className="mb-2 max-h-24 overflow-y-auto border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {showMoney ? (
            <div className="min-w-0 text-xs md:text-sm">
              <div>
                Total <b className="tabular-nums">{formatUSD(total)}</b>
                <span className="hidden text-gray-400 sm:inline"> ({formatUSD(subtotal)} − {discountBps / 100}%)</span>
              </div>
              {inventoryMode ? (
                <div className="text-gray-500">From your inventory · goods already paid</div>
              ) : (
                <div className={creditCents - total < 0 ? "text-red" : "text-gray-500"}>
                  Credit after: {formatUSD(creditCents - total)}
                  {creditCents - total < 0 && <span className="hidden sm:inline"> · will be held for approval</span>}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm">{lines.length} line(s)</div>
          )}
          <div className="flex shrink-0 gap-2">
            <button type="button" className="btn" disabled={pending || !lines.length} onClick={() => save(false)}>Save draft</button>
            <button type="button" className="btn-primary" disabled={pending || !lines.length || (mode === "existing" && !draft && !customerId)} onClick={() => save(true)}>
              {pending ? "Saving…" : "Submit order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
