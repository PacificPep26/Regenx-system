"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setInventoryMode } from "@/app/actions/inventory";

/** Admin: put a store on the inventory model (buy stock up front, fill customer orders from it). */
export function InventoryModeToggle({ storeId, on }: { storeId: string; on: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  return (
    <div className="space-y-2 text-sm">
      <p className="text-gray-600">
        On: the store adds inventory (kept at GP, nothing charged) and customer orders are filled from that stock; the cost of goods is deducted when each customer order is processed.
        Off: customer orders are not tied to a stock list, as before. Orders already in progress keep working either way.
      </p>
      <button
        className={on ? "btn" : "btn-primary"}
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await setInventoryMode(storeId, !on);
            setMsg(r.error ?? r.ok);
            router.refresh();
          })
        }
      >
        {on ? "Turn inventory mode off" : "Turn inventory mode on"}
      </button>
      {msg && <span className="ml-2 text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
