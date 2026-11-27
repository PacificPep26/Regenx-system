"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustStock, setMinimum } from "@/app/actions/inventory";
import { useDialog } from "./Dialog";

/** Per-row tools on the store's stock list: admin fixes a count; the owner sets the minimum that triggers a low-stock alert. */
export function StockRowActions({ storeId, productId, name, minimum, custom, canAdjust, canSetMinimum }: { storeId: string; productId: string; name: string; minimum: number; custom?: boolean; canAdjust: boolean; canSetMinimum: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string>();
  const { dialog, prompt } = useDialog();
  const done = (r: { error?: string }) => {
    setErr(r.error);
    if (!r.error) router.refresh();
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {dialog}
      {canSetMinimum && (
        <button
          className="btn h-7 px-2 text-xs"
          disabled={busy}
          onClick={async () => {
            const v = await prompt({ title: `Minimum for ${name}`, message: "You get a notification when the available stock reaches this number (and again when it is out). 0 = the default of 5.", input: { label: "Minimum units", placeholder: String(minimum), required: true }, confirmLabel: "Save" });
            if (v !== null) start(async () => done(await setMinimum(storeId, productId, Number(v))));
          }}
        >
          {custom ? `Alert at ${minimum}` : `Alert at ${minimum} (auto)`}
        </button>
      )}
      {canAdjust && (
        <button
          className="btn h-7 px-2 text-xs"
          disabled={busy}
          onClick={async () => {
            const d = await prompt({ title: `Adjust ${name}`, message: "Units to add (+) or remove (-). No money changes.", input: { label: "Change (e.g. -2 or 5)", required: true }, confirmLabel: "Next" });
            if (d === null) return;
            const reason = await prompt({ title: "Reason", message: "The store will see this.", input: { label: "Reason", required: true }, confirmLabel: "Adjust stock" });
            if (reason !== null) start(async () => done(await adjustStock(storeId, productId, Number(d), reason)));
          }}
        >
          Adjust
        </button>
      )}
      {err && <span role="alert" className="text-xs text-red">{err}</span>}
    </span>
  );
}
