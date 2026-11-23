"use client";

import { useActionState } from "react";

type State = { error?: string; ok?: string } | undefined;

/** <form> bound to a server action with inline success / error feedback. */
export function ActionForm({
  action,
  children,
  submit,
  className = "",
  danger,
}: {
  action: (s: State, f: FormData) => Promise<State>;
  children: React.ReactNode;
  submit: string;
  className?: string;
  danger?: boolean;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className={`space-y-3 ${className}`}>
      {children}
      {state?.error && <p role="alert" className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{state.error}</p>}
      {state?.ok && <p className="break-all border-l-4 border-ok bg-ok/5 px-3 py-2 text-sm text-ok">{state.ok}</p>}
      <button className={danger ? "btn-danger" : "btn-primary"} disabled={pending}>{pending ? "Saving…" : submit}</button>
    </form>
  );
}
