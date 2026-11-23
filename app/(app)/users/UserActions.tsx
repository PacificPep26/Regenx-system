"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { resetPassword, setUserActive } from "@/app/actions/ops";
import { useDialog } from "@/components/Dialog";

export function UserActions({ id, active, self }: { id: string; active: boolean; self: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ email: string; password: string }>();
  const [err, setErr] = useState<string>();
  const { dialog, confirm } = useDialog();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {result && (
        <span className="border-l-4 border-ok bg-ok/5 px-2 py-1 text-xs">
          {result.email} → <b className="select-all font-mono">{result.password}</b> (shown once)
        </span>
      )}
      {err && <span className="text-xs text-red">{err}</span>}
      <button
        className="btn h-8 text-xs"
        disabled={pending}
        onClick={async () => {
          if (!(await confirm({ title: "Reset password", message: "Creates a new temporary password and signs this user out everywhere.", confirmLabel: "Reset", danger: true }))) return;
          start(async () => {
            const r = await resetPassword(id);
            if (r.error) setErr(r.error);
            else setResult({ email: r.email!, password: r.password! });
          });
        }}
      >
        <KeyRound size={14} /> Reset password
      </button>
      {!self && (
        <button
          className={`btn h-8 text-xs ${active ? "text-red" : ""}`}
          disabled={pending}
          onClick={() => start(async () => { await setUserActive(id, !active); router.refresh(); })}
        >
          {active ? "Deactivate" : "Activate"}
        </button>
      )}
      {dialog}
    </div>
  );
}
