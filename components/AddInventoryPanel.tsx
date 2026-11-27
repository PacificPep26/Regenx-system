"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { InventoryForm } from "./InventoryForm";

/**
 * "+ Add inventory" opens the form right where the button is (a sheet over the page), so there is no page change
 * and no second click. After adding, it closes and the page refreshes.
 */
export function AddInventoryPanel({ storeId, slug, discountBps, creditCents, defaultOpen, className = "btn-primary", label = "Add inventory", icon = true }: { storeId: string; slug: string; discountBps: number; creditCents: number; defaultOpen?: boolean; className?: string; label?: string; icon?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {icon && <Plus size={16} />} {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white md:bg-black/40 md:p-6" onMouseDown={() => setOpen(false)}>
          <div className="mx-auto min-h-full max-w-3xl bg-white p-3 md:min-h-0 md:border md:border-line md:p-4" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy">Add inventory</h2>
              <button type="button" className="btn h-9 w-9 px-0" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            <InventoryForm
              storeId={storeId}
              slug={slug}
              discountBps={discountBps}
              creditCents={creditCents}
              onDone={() => {
                setOpen(false);
                if (defaultOpen) router.replace(`/s/${slug}/inventory`); // drop ?add=1 from old links; otherwise stay where you are
                router.refresh();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
