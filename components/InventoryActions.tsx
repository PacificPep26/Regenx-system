"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitInventory, cancelInventory } from "@/app/actions/inventory";
import { useDialog } from "./Dialog";

/** Buttons for one inventory order, by status and role. `compact` is the small form used inside lists. */
export function InventoryActions({ id, status, role, compact }: { id: string; status: string; role: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>();
  const { dialog, prompt } = useDialog();
  const isAdmin = role === "ADMIN";
  const act = (fn: () => Promise<{ error?: string; ok?: string } | undefined>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (!r?.error) router.refresh();
    });
  const canCancel = status === "DRAFT";
  return (
    <div className="space-y-2">
      {dialog}
      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" && role !== "FULFILLMENT" && <button className="btn-primary" disabled={pending} onClick={() => act(() => submitInventory(id))}>Submit</button>}
        {canCancel && !compact && role !== "FULFILLMENT" && (
          <button
            className="btn-danger"
            disabled={pending}
            onClick={async () => {
              const reason = await prompt({ title: "Cancel inventory order", message: "Nothing was charged for this inventory order.", input: { label: "Reason (optional)", multiline: true }, confirmLabel: "Cancel order", danger: true });
              if (reason !== null) act(() => cancelInventory(id, reason || undefined));
            }}
          >
            Cancel
          </button>
        )}
      </div>
      {msg?.error && <p role="alert" className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{msg.error}</p>}
    </div>
  );
}
