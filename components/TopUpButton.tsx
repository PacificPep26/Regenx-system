"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { requestStoreTopUp } from "@/app/actions/topups";

/** Partner: ask the admin to add funds. `suggested` (cents) is what restores the weekly minimum balance. */
export function TopUpButton({ storeId, suggested, pending: waiting, className = "" }: { storeId: string; suggested: number; pending: boolean; className?: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>();
  const send = () =>
    start(async () => {
      const r = await requestStoreTopUp(storeId, amount, note);
      setMsg(r);
      if (!r?.error) {
        setOpen(false);
        router.refresh();
      }
    });
  return (
    <>
      <button
        className={`btn ${className}`}
        disabled={waiting}
        title={waiting ? "A top-up request is waiting for the admin" : undefined}
        onClick={() => {
          setMsg(undefined);
          setAmount(suggested > 0 ? (suggested / 100).toFixed(2) : "");
          setOpen(true);
        }}
      >
        <Plus size={14} /> {waiting ? "Requested" : <><span className="hidden sm:inline">Request </span>top-up</>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md bg-white" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-bold text-navy">Request top-up</h2>
              <button className="btn h-8 w-8 px-0" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <p className="text-gray-600">Send the money to RegenX first, then tell us how much. The admin adds it to your balance.</p>
              <div>
                <label className="label">Amount ($)</label>
                <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                {suggested > 0 && <p className="mt-1 text-xs text-gray-500">Restores your minimum balance: ${(suggested / 100).toFixed(2)}</p>}
              </div>
              <div>
                <label className="label">Note (wire / ACH reference, optional)</label>
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {msg?.error && <p role="alert" className="text-red">{msg.error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
              <button className="btn" onClick={() => setOpen(false)}>Back</button>
              <button className="btn-primary" disabled={busy || !amount.trim()} onClick={send}>Send request</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
