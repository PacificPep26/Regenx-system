"use client";

import { createPortal } from "react-dom";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { addPayment } from "@/app/actions/ops";
import { allocatePayment } from "@/lib/ledger";
import { toCents, formatUSD } from "@/lib/money";

type Props = { storeId: string; storeName: string; required: number; credit: number; outstanding: number; shipping: number; status: string };

/** Admin: one place to add money to a store, with a live preview of where it goes. */
export function AddFunds({ storeId, storeName, required, credit, outstanding, shipping, status }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [state, action, pending] = useActionState(addPayment, undefined);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state?.ok, router]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  let cents = 0;
  try {
    cents = amount ? toCents(amount) : 0;
  } catch {
    cents = 0;
  }
  const a = cents > 0 ? allocatePayment(cents, { outstandingCents: outstanding, shippingCents: shipping }) : null;
  const newCredit = credit + (a?.creditCents ?? 0);
  const quick = [required - credit, required].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);

  const row = (label: string, v: number, strong = false) => (
    <div className={`flex justify-between ${strong ? "font-bold" : ""}`}><span>{label}</span><span className="tabular-nums">{formatUSD(v)}</span></div>
  );

  return (
    <>
      <button className="btn-primary" onClick={() => { setAmount(""); setOpen(true); }}><Plus size={16} /> Add funds</button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={() => setOpen(false)}>
            <form
              action={action}
              role="dialog"
              aria-modal="true"
              aria-label="Add funds"
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full border-t-4 border-t-navy bg-white sm:max-w-md sm:border sm:border-line sm:border-t-navy"
            >
              <input type="hidden" name="storeId" value={storeId} />
              <div className="flex items-start justify-between gap-2 px-4 pt-4">
                <div>
                  <h2 className="font-bold text-navy">Add funds · {storeName}</h2>
                  <p className="text-xs text-gray-500">{status === "PENDING" ? "Store is pending: it activates automatically once credit reaches the required deposit." : "Record money RegenX received from this store."}</p>
                </div>
                <button type="button" className="btn h-8 w-8 px-0" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button>
              </div>

              <div className="space-y-3 px-4 py-3">
                <div>
                  <label className="label" htmlFor="af-amount">Amount received ($)</label>
                  <input id="af-amount" name="amount" required inputMode="decimal" autoFocus className="input text-lg" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                  {quick.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {quick.map((v) => (
                        <button key={v} type="button" className="btn h-7 px-2 text-xs" onClick={() => setAmount((v / 100).toFixed(2))}>
                          {v === required - credit ? "Replenish " : "Full deposit "}{formatUSD(v)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="label">Method</label><select name="method" className="input">{["WIRE", "ACH", "CHECK", "CARD", "OTHER"].map((m) => <option key={m}>{m}</option>)}</select></div>
                  <div><label className="label">Reference</label><input name="reference" className="input" placeholder="wire #, check #…" /></div>
                </div>

                <div className="space-y-1 border border-line bg-soft p-3 text-sm">
                  <div className="label mb-1">Where it goes</div>
                  {a ? (
                    <>
                      {a.outstandingCents > 0 && row("Pays outstanding overage", a.outstandingCents)}
                      {a.shippingCents > 0 && row("Pays shipping due", a.shippingCents)}
                      {row("Adds to prepaid credit", a.creditCents)}
                      <div className="mt-1 border-t border-line pt-1">
                        {row("Credit after", newCredit, true)}
                        <div className={`text-xs ${newCredit >= required ? "text-ok" : "text-gray-500"}`}>
                          {newCredit >= required ? (newCredit > required ? `Above the required ${formatUSD(required)} deposit` : "Back to the required deposit") : `${formatUSD(required - newCredit)} still needed to reach ${formatUSD(required)}`}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-500">Enter an amount. Order of payment: outstanding, then shipping, then credit. Now: credit {formatUSD(credit)}{outstanding > 0 && ` · owes ${formatUSD(outstanding)}`}{shipping > 0 && ` · shipping due ${formatUSD(shipping)}`}.</div>
                  )}
                </div>

                {state?.error && <p role="alert" className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{state.error}</p>}
                {state?.ok && <p className="border-l-4 border-ok bg-ok/5 px-3 py-2 text-sm text-ok">{state.ok}</p>}
              </div>

              <div className="flex justify-end gap-2 border-t border-line bg-soft px-4 py-3">
                <button type="button" className="btn" onClick={() => setOpen(false)}>{state?.ok ? "Close" : "Cancel"}</button>
                {!state?.ok && <button className="btn-primary" disabled={pending || cents <= 0}>{pending ? "Saving…" : `Record ${cents > 0 ? formatUSD(cents) : "payment"}`}</button>}
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
