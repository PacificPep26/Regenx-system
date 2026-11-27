"use client";

import { useState, useTransition } from "react";
import { reportMismatch } from "@/app/actions/inventory";
import { useDialog } from "./Dialog";

/** GP: the shelf count differs from the system, tell the admin in one step. */
export function ReportMismatchButton({ storeId, productId, name, system }: { storeId: string; productId: string; name: string; system: number }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>();
  const { dialog, prompt } = useDialog();
  return (
    <span className="inline-flex items-center gap-1">
      {dialog}
      <button
        className="btn h-6 px-2 text-[11px]"
        disabled={busy}
        onClick={async () => {
          const v = await prompt({ title: `Count ${name}`, message: `The system says ${system}. How many are on the shelf?`, input: { label: "Counted units", placeholder: String(system), required: true }, confirmLabel: "Report" });
          if (v !== null) start(async () => setMsg(await reportMismatch(storeId, productId, Number(v))));
        }}
      >
        Report count
      </button>
      {msg?.ok && <span className="text-[11px] text-ok">{msg.ok}</span>}
      {msg?.error && <span role="alert" className="text-[11px] text-red">{msg.error}</span>}
    </span>
  );
}
