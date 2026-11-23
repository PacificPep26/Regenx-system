"use client";

import { useActionState, useTransition } from "react";
import { makeKey, removeKey, requestInsurance, type PlanState } from "@/app/actions/plan";
import { useDialog } from "@/components/Dialog";

export function NewKey({ storeId }: { storeId: string }) {
  const [state, action, pending] = useActionState(makeKey, undefined as PlanState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="storeId" value={storeId} />
      <div className="flex gap-2">
        <input name="name" placeholder="Key name (e.g. Shopify)" className="input min-w-0 flex-1" maxLength={60} />
        <button className="btn-primary" disabled={pending}>Create key</button>
      </div>
      {state?.error && <p role="alert" className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{state.error}</p>}
      {state?.key && (
        <div className="border-l-4 border-ok bg-ok/5 px-3 py-2 text-sm">
          <div className="text-ok">{state.ok}</div>
          <code className="mt-1 block select-all break-all font-mono">{state.key}</code>
        </div>
      )}
    </form>
  );
}

export function RevokeKey({ storeId, keyId }: { storeId: string; keyId: string }) {
  const [pending, start] = useTransition();
  const { dialog, confirm } = useDialog();
  return (
    <>
      <button
        className="btn h-8 text-xs text-red"
        disabled={pending}
        onClick={async () => {
          if (await confirm({ title: "Revoke key", message: "Integrations using this key stop working immediately.", confirmLabel: "Revoke", danger: true })) start(() => removeKey(storeId, keyId));
        }}
      >
        Revoke
      </button>
      {dialog}
    </>
  );
}

export function RequestInsurance({ storeId }: { storeId: string }) {
  const [state, action, pending] = useActionState(async () => requestInsurance(storeId), undefined as PlanState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <button className="btn" disabled={pending}>Request insurance coverage</button>
      {state?.error && <span className="text-sm text-red">{state.error}</span>}
      {state?.ok && <span className="text-sm text-ok">{state.ok}</span>}
    </form>
  );
}
