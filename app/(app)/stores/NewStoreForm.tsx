"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createStore } from "@/app/actions/ops";

export function NewStoreForm() {
  const [state, action, pending] = useActionState(createStore, undefined);
  const c = state?.created;
  if (c)
    return (
      <div className="border-l-4 border-ok bg-ok/5 p-3 text-sm">
        <div className="font-semibold text-ok">Store “{c.name}” created</div>
        <div className="mt-2">Send these login details to the owner (shown once):</div>
        <dl className="mt-1 space-y-0.5 font-mono">
          <div>Login: <b>{c.email}</b></div>
          <div>Password: <b className="select-all">{c.password}</b></div>
        </dl>
        <div className="mt-3 flex gap-2">
          <Link href={`/s/${c.slug}/settings`} className="btn">Open store</Link>
          <button className="btn" onClick={() => location.reload()}>Add another</button>
        </div>
      </div>
    );
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className="label">Store name *</label><input name="name" required className="input" /></div>
        <div><label className="label">Slug *</label><input name="slug" required className="input" pattern="[a-z0-9-]{2,40}" placeholder="alpha-store" /></div>
        <div>
          <label className="label">Tier</label>
          <select name="tier" className="input"><option value="STARTER">Starter · $10,000 · 5%</option><option value="PREMIUM">Premium · $50,000 · 10%</option></select>
        </div>
        <div><label className="label">Allowed regions</label><input name="regions" defaultValue="US" className="input" /></div>
        <div><label className="label">Owner name *</label><input name="ownerName" required className="input" /></div>
        <div><label className="label">Owner email (login) *</label><input name="ownerEmail" type="email" required className="input" /></div>
        <div className="sm:col-span-2"><label className="label">Password (blank = auto-generate)</label><input name="ownerPassword" minLength={10} className="input" autoComplete="off" /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="depositReceived" className="h-4 w-4" /> Deposit received · activate now</label>
      </div>
      {state?.error && <p role="alert" className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create store"}</button>
    </form>
  );
}
