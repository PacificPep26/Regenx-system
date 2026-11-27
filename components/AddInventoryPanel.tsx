"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { InventoryForm } from "./InventoryForm";

/** Add inventory right on the Inventory page: one click opens the form, one click adds it to stock. */
export function AddInventoryPanel({ storeId, slug, discountBps, defaultOpen }: { storeId: string; slug: string; discountBps: number; defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!!defaultOpen);
  if (!open)
    return (
      <button className="btn-primary w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus size={16} /> Add inventory
      </button>
    );
  return (
    <section className="panel space-y-3 border-t-4 border-t-navy p-3 md:p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-navy">Add inventory</h2>
        <button className="btn h-8 w-8 px-0" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button>
      </div>
      <InventoryForm
        storeId={storeId}
        slug={slug}
        discountBps={discountBps}
        onDone={() => {
          setOpen(false);
          router.replace(`/s/${slug}/inventory`);
          router.refresh();
        }}
      />
    </section>
  );
}
