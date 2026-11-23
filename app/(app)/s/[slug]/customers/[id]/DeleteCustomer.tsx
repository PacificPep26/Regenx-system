"use client";

import { useTransition, useState } from "react";
import { deleteCustomer } from "@/app/actions/customers";
import { useDialog } from "@/components/Dialog";

export function DeleteCustomer({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string>();
  const { dialog, confirm } = useDialog();
  return (
    <>
      <button
        className="btn text-red"
        disabled={pending}
        onClick={async () => {
          if (await confirm({ title: "Delete customer", message: "This cannot be undone.", confirmLabel: "Delete", danger: true }))
            start(async () => setErr((await deleteCustomer(id))?.error));
        }}
      >
        Delete
      </button>
      {err && <span className="text-sm text-red">{err}</span>}
      {dialog}
    </>
  );
}
