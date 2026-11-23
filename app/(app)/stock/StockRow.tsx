"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { receive, adjust, saveSettings } from "@/app/actions/stock";

export type StockRowData = {
  id: string; sku: string; name: string; strength: string;
  trackStock: boolean; reorderLevel: number;
  onHand: number; reserved: number; available: number;
  status: "untracked" | "out" | "low" | "ok";
};

const BADGE: Record<StockRowData["status"], string> = {
  untracked: "border-gray-300 text-gray-500",
  out: "border-red bg-red text-white",
  low: "border-warn text-warn",
  ok: "border-ok text-ok",
};
const LABEL = { untracked: "unlimited", out: "out", low: "low", ok: "ok" };

function Msg({ s }: { s?: { error?: string; ok?: string } }) {
  return (
    <>
      {s?.error && <span className="text-xs text-red">{s.error}</span>}
      {s?.ok && <span className="text-xs text-ok">{s.ok}</span>}
    </>
  );
}

export function StockRow({ r }: { r: StockRowData }) {
  const [open, setOpen] = useState(false);
  const [rec, recAction, recPending] = useActionState(receive, undefined);
  const [adj, adjAction, adjPending] = useActionState(adjust, undefined);
  const [set, setAction, setPending] = useActionState(saveSettings, undefined);
  const short = r.trackStock && r.available < 0;

  return (
    <li className={short ? "bg-red/5" : ""}>
      <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-hover" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{r.name} <span className="font-normal text-gray-500">{r.strength}</span></span>
          <span className="block truncate text-xs text-gray-400">{r.sku}</span>
        </span>
        <span className="hidden shrink-0 grid-cols-3 gap-4 text-right text-sm tabular-nums sm:grid">
          <span><b>{r.trackStock ? r.onHand : "∞"}</b><i className="block text-[10px] font-normal not-italic text-gray-400">on hand</i></span>
          <span><b>{r.trackStock ? r.reserved : "—"}</b><i className="block text-[10px] font-normal not-italic text-gray-400">reserved</i></span>
          <span><b className={short ? "text-red" : ""}>{r.trackStock ? r.available : "∞"}</b><i className="block text-[10px] font-normal not-italic text-gray-400">available</i></span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
          <span className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${BADGE[r.status]}`}>{short ? "short" : LABEL[r.status]}</span>
          {r.trackStock && <span className="text-xs tabular-nums text-gray-500 sm:hidden">{r.onHand} / {r.reserved} / <b className={short ? "text-red" : ""}>{r.available}</b></span>}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-3 border-t border-line bg-soft p-3 lg:grid-cols-3">
          <form action={recAction} className="space-y-2 border border-line bg-white p-2">
            <input type="hidden" name="productId" value={r.id} />
            <div className="label mb-0">Receive stock</div>
            <div className="flex gap-2">
              <input name="qty" required inputMode="numeric" placeholder="Qty" className="input w-20" />
              <input name="memo" placeholder="PO / note" className="input min-w-0 flex-1" />
            </div>
            <div className="flex items-center gap-2"><button className="btn-primary h-9" disabled={recPending}>Receive</button><Msg s={rec} /></div>
          </form>

          <form action={adjAction} className="space-y-2 border border-line bg-white p-2">
            <input type="hidden" name="productId" value={r.id} />
            <div className="label mb-0">Stock-take correction (±)</div>
            <div className="flex gap-2">
              <input name="delta" required inputMode="numeric" placeholder="-2 or +5" className="input w-24" />
              <input name="memo" required minLength={3} placeholder="Reason (required)" className="input min-w-0 flex-1" />
            </div>
            <div className="flex items-center gap-2"><button className="btn h-9" disabled={adjPending}>Adjust</button><Msg s={adj} /></div>
          </form>

          <form action={setAction} className="space-y-2 border border-line bg-white p-2">
            <input type="hidden" name="productId" value={r.id} />
            <div className="label mb-0">Settings</div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="trackStock" defaultChecked={r.trackStock} className="h-4 w-4" /> Limit by stock <span className="text-xs text-gray-400">(off = unlimited)</span></label>
              <label className="flex items-center gap-2 text-sm">Alert at <input name="reorderLevel" inputMode="numeric" defaultValue={r.reorderLevel} className="input h-9 w-16" /></label>
            </div>
            <div className="flex items-center gap-2"><button className="btn h-9" disabled={setPending}>Save</button><Msg s={set} /><Link href={`/stock/history?q=${encodeURIComponent(r.sku)}`} className="ml-auto text-xs text-navy underline">History</Link></div>
          </form>
        </div>
      )}
    </li>
  );
}
