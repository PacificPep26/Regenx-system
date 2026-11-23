"use client";

import { useActionState, useState } from "react";
import type { Product, ProductDoc } from "@prisma/client";
import { updateProduct, addProductDoc, deleteProductDoc } from "@/app/actions/ops";
import { formatUSD } from "@/lib/money";

export function ProductRow({ p }: { p: Product & { docs: ProductDoc[] } }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateProduct, undefined);
  const [docState, docAction, docPending] = useActionState(addProductDoc, undefined);
  return (
    <li className={p.active ? "" : "bg-soft"}>
      <button className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-hover" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="min-w-0">
          <span className={`font-medium ${p.active ? "" : "text-gray-400 line-through"}`}>{p.name}</span> <span className="text-gray-500">{p.strength}</span>
          {p.restricted && <span className="ml-1 border border-red px-1 text-[10px] text-red">RESTRICTED</span>}
          <span className="block truncate text-xs text-gray-400">{p.sku}{p.sourceCode ? ` · ${p.sourceCode}` : " · no code"}</span>
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{formatUSD(p.basePriceCents)}</span>
      </button>
      {open && (
        <form action={action} className="grid grid-cols-2 gap-3 border-t border-line p-3 sm:grid-cols-6 sm:items-end">
          <input type="hidden" name="id" value={p.id} />
          <div className="col-span-2 sm:col-span-3"><label className="label">Name</label><input name="name" defaultValue={p.name} required className="input" /></div>
          <div><label className="label">Strength</label><input name="strength" defaultValue={p.strength} required className="input" /></div>
          <div><label className="label">Source code</label><input name="sourceCode" defaultValue={p.sourceCode ?? ""} className="input" /></div>
          <div><label className="label">UPC</label><input name="upc" defaultValue={p.upc ?? ""} inputMode="numeric" className="input" placeholder="8-14 digits" /></div>
          <div><label className="label">Base price ($)</label><input name="price" defaultValue={(p.basePriceCents / 100).toFixed(2)} inputMode="decimal" className="input" /></div>
          <div className="col-span-2 sm:col-span-3"><label className="label">Notes</label><input name="notes" defaultValue={p.notes ?? ""} className="input" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} className="h-4 w-4" /> Active</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="restricted" defaultChecked={p.restricted} className="h-4 w-4" /> Restricted</label>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-6">
            <button className="btn-primary" disabled={pending}>Save</button>
            <span className="text-xs text-gray-400">SKU {p.sku} (fixed)</span>
            {state?.error && <span className="text-xs text-red">{state.error}</span>}
            {state?.ok && <span className="text-xs text-ok">{state.ok}</span>}
          </div>
        </form>
      )}
      {open && (
        <div className="space-y-2 border-t border-line bg-soft p-3">
          <div className="label mb-0">Documentation (visible to partners and GP)</div>
          <ul className="divide-y divide-line border border-line bg-white text-sm">
            {p.docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-navy underline">{d.title}</a>
                <button type="button" className="btn h-8 text-xs text-red" onClick={() => deleteProductDoc(d.id)}>Remove</button>
              </li>
            ))}
            {!p.docs.length && <li className="px-3 py-1.5 text-gray-500">None yet.</li>}
          </ul>
          <form action={docAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="productId" value={p.id} />
            <input name="title" required placeholder="Title (e.g. COA batch 12)" className="input min-w-0 flex-1" />
            <input name="url" required placeholder="https://…" className="input min-w-0 flex-[2]" />
            <button className="btn-primary" disabled={docPending}>Add</button>
            {docState?.error && <span className="w-full text-xs text-red">{docState.error}</span>}
            {docState?.ok && <span className="w-full text-xs text-ok">{docState.ok}</span>}
          </form>
        </div>
      )}
    </li>
  );
}
