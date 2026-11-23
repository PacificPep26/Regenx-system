"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="remember" defaultChecked className="h-4 w-4" /> Keep me signed in
      </label>
      {state?.error && <p role="alert" className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <Link href="/forgot-password" className="block text-center text-sm text-navy underline">Forgot password?</Link>
    </form>
  );
}
