"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fulfillStoreTopUp, dismissStoreTopUp } from "@/app/actions/topups";
import { useDialog } from "./Dialog";

/** Admin: record the money that arrived for a top-up request (normal payment allocation), or dismiss it. */
export function TopUpAdminButtons({ id, amount }: { id: string; amount: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string>();
  const { dialog, prompt, confirm } = useDialog();
  const done = (r: { error?: string } | undefined) => {
    setErr(r?.error);
    if (!r?.error) router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {dialog}
      <button
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          const method = await prompt({ title: `Record ${amount}`, message: "How did the money arrive? (e.g. Wire, ACH)", input: { label: "Method", required: true }, confirmLabel: "Next" });
          if (method === null) return;
          const reference = await prompt({ title: "Reference", message: "Transfer or confirmation number (optional).", input: { label: "Reference" }, confirmLabel: "Record payment" });
          if (reference !== null) start(async () => done(await fulfillStoreTopUp(id, amount.replace(/[$,]/g, ""), method, reference)));
        }}
      >
        Record payment
      </button>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          if (await confirm({ title: "Dismiss request", message: "The store is not charged or credited.", confirmLabel: "Dismiss" })) start(async () => done(await dismissStoreTopUp(id)));
        }}
      >
        Dismiss
      </button>
      {err && <span role="alert" className="text-sm text-red">{err}</span>}
    </div>
  );
}
