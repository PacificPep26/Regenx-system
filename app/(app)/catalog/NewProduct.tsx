"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createProduct } from "@/app/actions/ops";

export function NewProduct() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createProduct, undefined);
  return (
    <div className="mb-3">
      <button className="btn-primary" onClick={() => setOpen(!open)} aria-expanded={open}><Plus size={16} /> New product</button>
      {open && (
        <form key={state?.ok ?? "f"} action={action} className="panel mt-2 grid grid-cols-2 gap-3 p-3 sm:grid-cols-6 sm:items-end">
          <div className="col-span-2 sm:col-span-3"><label className="label">Name *</label><input name="name" required className="input" /></div>
          <div><label className="label">Strength *</label><input name="strength" required className="input" placeholder="10mg" /></div>
          <div><label className="label">Source code</label><input name="sourceCode" className="input" /></div>
          <div><label className="label">Base price ($) *</label><input name="price" required inputMode="decimal" className="input" /></div>
          <div className="col-span-2 sm:col-span-3"><label className="label">Notes</label><input name="notes" className="input" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked className="h-4 w-4" /> Active</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="restricted" className="h-4 w-4" /> Restricted</label>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-6">
            <button className="btn-primary" disabled={pending}>Add product</button>
            {state?.error && <span className="text-sm text-red">{state.error}</span>}
            {state?.ok && <span className="text-sm text-ok">{state.ok}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
