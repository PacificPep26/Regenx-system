"use client";

import { useActionState } from "react";
import { createCustomer, updateCustomer } from "@/app/actions/customers";
import { CustomerFields } from "./CustomerFields";

type Values = Record<string, string>;

export function CustomerForm({ storeId, customerId, values }: { storeId: string; customerId?: string; values?: Values }) {
  const [state, action, pending] = useActionState(customerId ? updateCustomer : createCustomer, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="storeId" value={storeId} />
      {customerId && <input type="hidden" name="id" value={customerId} />}
      <CustomerFields values={values} errors={state?.fieldErrors} />
      {state?.error && <p role="alert" className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{state.error}</p>}
      {state?.ok && <p className="border-l-4 border-ok bg-ok/5 px-3 py-2 text-sm text-ok">{state.ok}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={pending}>{pending ? "Saving…" : customerId ? "Save changes" : "Create customer"}</button>
    </form>
  );
}
