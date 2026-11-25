"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestGpPayout, resolveGpPayout } from "@/app/actions/payouts";
import { useDialog } from "./Dialog";

export function RequestPayoutButton({ available, blocked }: { available: number; blocked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>();
  const { dialog, prompt } = useDialog();
  return (
    <div className="flex flex-col items-end gap-1">
      {dialog}
      <button
        className="btn-primary"
        disabled={pending || blocked || available <= 0}
        onClick={async () => {
          const v = await prompt({
            title: "Request payout",
            message: `Available: $${(available / 100).toFixed(2)}. The admin will be notified.`,
            input: { label: "Amount ($)", placeholder: (available / 100).toFixed(2), required: true },
            confirmLabel: "Send request",
          });
          if (v === null) return;
          start(async () => {
            const r = await requestGpPayout(v);
            setMsg(r);
            if (!r?.error) router.refresh();
          });
        }}
      >
        Request payout
      </button>
      {blocked && <span className="text-xs text-gray-500">A request is waiting for approval.</span>}
      {msg?.error && <span role="alert" className="text-sm text-red">{msg.error}</span>}
      {msg?.ok && <span className="text-sm text-ok">{msg.ok}</span>}
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
