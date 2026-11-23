"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetWithToken } from "@/app/actions/reset";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetWithToken, undefined);
  if (!token) return <p className="text-sm text-red">Missing reset token. Open the link from your email, or <Link className="underline" href="/forgot-password">request a new one</Link>.</p>;
  if (state?.ok)
    return (
      <div className="space-y-3">
        <p className="border-l-4 border-ok bg-ok/5 px-3 py-2 text-sm text-ok">{state.ok}</p>
        <Link href="/login" className="btn-primary w-full">Sign in</Link>
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div><label className="label" htmlFor="password">New password (min 10)</label><input id="password" name="password" type="password" minLength={10} autoComplete="new-password" required className="input" /></div>
      <div><label className="label" htmlFor="confirm">Confirm</label><input id="confirm" name="confirm" type="password" minLength={10} autoComplete="new-password" required className="input" /></div>
      {state?.error && <p role="alert" className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Set password"}</button>
    </form>
  );
}
