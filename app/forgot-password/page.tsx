"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestReset } from "@/app/actions/reset";
import { AuthCard } from "@/components/AuthCard";

export default function ForgotPassword() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  return (
    <AuthCard title="Forgot password">
      <form action={action} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        {state?.error && <p role="alert" className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{state.error}</p>}
        {state?.ok && <p className="border-l-4 border-ok bg-ok/5 px-3 py-2 text-sm text-ok">{state.ok}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Sending…" : "Request reset"}</button>
        <Link href="/login" className="block text-center text-sm text-navy underline">Back to sign in</Link>
      </form>
    </AuthCard>
  );
}
