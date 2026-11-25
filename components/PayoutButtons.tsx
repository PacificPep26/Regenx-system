"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { requestGpPayout, resolveGpPayout } from "@/app/actions/payouts";
import { useDialog } from "./Dialog";

export type PayoutPreset = { key: string; label: string; from: string; to: string };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const sumIn = (days: { day: string; cents: number }[], r: { from: string; to: string } | null, all: number) =>
  r ? days.filter((d) => d.day >= r.from && d.day <= r.to).reduce((n, d) => n + d.cents, 0) : all;

/** Request payout: for a period (yesterday / this week / last week / custom days) or just everything available. */
export function RequestPayoutButton({ available, blocked, presets, days }: { available: number; blocked: boolean; presets: PayoutPreset[]; days: { day: string; cents: number }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>();
  const [sel, setSel] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  const rangeOf = (k: string, f: string, t: string) => (k === "all" ? null : k === "custom" ? { from: f, to: t } : presets.find((x) => x.key === k) ?? null);
  const range = rangeOf(sel, from, to);
  const earnedIn = sumIn(days, range, available);
  const max = Math.max(0, Math.min(available, earnedIn));
  const pick = (k: string, f = from, t = to) => {
    setSel(k);
    const e = sumIn(days, rangeOf(k, f, t), available);
    setAmount((Math.max(0, Math.min(available, e)) / 100).toFixed(2));
  };
  const close = () => setOpen(false);
  const send = () =>
    start(async () => {
      const r = await requestGpPayout(amount, range?.from, range?.to);
      setMsg(r);
      if (!r?.error) {
        close();
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="btn-primary"
        disabled={pending || blocked || available <= 0}
        onClick={() => {
          setMsg(undefined);
          pick("all");
          setOpen(true);
        }}
      >
        Request payout
      </button>
      {blocked && <span className="text-xs text-gray-500">A request is waiting for approval.</span>}
      {msg?.ok && <span className="text-sm text-ok">{msg.ok}</span>}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={close}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md bg-white" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-bold text-navy">Request payout</h2>
              <button className="btn h-8 w-8 px-0" aria-label="Close" onClick={close}><X size={16} /></button>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <p className="text-gray-600">Available: <b>{usd(available)}</b>. The admin will be notified.</p>
              <div>
                <label className="label">For</label>
                <select className="input" value={sel} onChange={(e) => pick(e.target.value)}>
                  <option value="all">Everything available</option>
                  {presets.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  <option value="custom">Choose days…</option>
                </select>
              </div>
              {sel === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="label">From</label><input type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); pick("custom", e.target.value, to); }} /></div>
                  <div><label className="label">To</label><input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); pick("custom", from, e.target.value); }} /></div>
                </div>
              )}
              {range && <p className="text-gray-600">Earned in this period: <b>{usd(earnedIn)}</b>{earnedIn > available ? ` (you can request up to ${usd(available)})` : ""}</p>}
              <div>
                <label className="label">Amount ($)</label>
                <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <p className="mt-1 text-xs text-gray-500">Up to {usd(max)}</p>
              </div>
              {msg?.error && <p role="alert" className="text-red">{msg.error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
              <button className="btn" onClick={close}>Back</button>
              <button className="btn-primary" disabled={pending || !amount.trim() || (sel === "custom" && (!from || !to))} onClick={send}>Send request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ResolvePayoutButtons({ id, amount }: { id: string; amount: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  const { dialog, prompt } = useDialog();
  const go = (status: "PAID" | "REJECTED", method: string, reference: string, note: string) =>
    start(async () => {
      const r = await resolveGpPayout(id, status, method, reference, note);
      setErr(r?.error);
      if (!r?.error) router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {dialog}
      <button
        className="btn-primary"
        disabled={pending}
        onClick={async () => {
          const method = await prompt({ title: `Mark ${amount} as paid`, message: "How did you pay GP? (e.g. Wire, ACH)", input: { label: "Method", required: true }, confirmLabel: "Next" });
          if (method === null) return;
          const reference = await prompt({ title: "Reference", message: "Transfer or confirmation number (optional).", input: { label: "Reference" }, confirmLabel: "Mark paid" });
          if (reference !== null) go("PAID", method, reference, "");
        }}
      >
        Mark paid
      </button>
      <button
        className="btn-danger"
        disabled={pending}
        onClick={async () => {
          const reason = await prompt({ title: "Reject request", message: "GP will see this reason.", input: { label: "Reason", required: true, multiline: true }, confirmLabel: "Reject", danger: true });
          if (reason !== null) go("REJECTED", "", "", reason);
        }}
      >
        Reject
      </button>
      {err && <span role="alert" className="text-sm text-red">{err}</span>}
    </div>
  );
}
