"use client";

import { useState, useTransition } from "react";
import { runStatementsNow } from "@/app/actions/ops";
import { useDialog } from "@/components/Dialog";

export function RunStatements() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  const { dialog, confirm } = useDialog();
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-ok">{msg}</span>}
      <button className="btn" disabled={pending} onClick={async () => {
          if (await confirm({ title: "Run weekly statements", message: "Generate statements for last week (Mon–Sun) for every active store.", confirmLabel: "Run" }))
            start(async () => setMsg((await runStatementsNow()).ok));
        }}>
        {pending ? "Running…" : "Run statements"}
      </button>
      {dialog}
    </div>
  );
}
