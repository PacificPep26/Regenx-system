"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { submitOrder, cancelOrder, approveHold, deleteDraft } from "@/app/actions/orders";
import { packOrder, shipOrder, deliverOrder, fixShippingFee } from "@/app/actions/ops";
import { useDialog } from "./Dialog";

type Props = {
  orderId: string;
  status: string;
  role: string;
  editHref?: string;
  listHref: string;
};

export function OrderActions({ orderId, status, role, editHref, listHref }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>();
  const [shipOpen, setShipOpen] = useState(status === "PACKING"); // while packing, the tracking form is the next step: show it
  const { dialog, confirm, prompt } = useDialog();
  const [shipState, shipAction, shipping] = useActionState(shipOrder, undefined);
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeState, feeAction, feeSaving] = useActionState(fixShippingFee, undefined);
  const isAdmin = role === "ADMIN";
  const isOps = isAdmin || role === "FULFILLMENT";
  const isPartner = role.startsWith("PARTNER");

  const act = (fn: () => Promise<{ error?: string; ok?: string } | undefined>, after?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      if (r?.error) return;
      if (after) router.push(after);
      else router.refresh();
    });

  const canCancel =
    (isPartner && ["DRAFT", "ON_HOLD", "APPROVED"].includes(status) && (role === "PARTNER_OWNER" || status === "DRAFT")) ||
    (isAdmin && ["DRAFT", "ON_HOLD", "APPROVED", "PACKING"].includes(status));

  return (
    <div className="space-y-2">
      {dialog}
      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" && !isOps && <button className="btn-primary" disabled={pending} onClick={() => act(() => submitOrder(orderId))}>Submit order</button>}
        {status === "DRAFT" && isAdmin && <button className="btn-primary" disabled={pending} onClick={() => act(() => submitOrder(orderId))}>Submit</button>}
        {status === "DRAFT" && editHref && role !== "FULFILLMENT" && <Link className="btn" href={editHref}>Edit</Link>}
        {status === "DRAFT" && role !== "FULFILLMENT" && (
          <button className="btn text-red" disabled={pending} onClick={async () => (await confirm({ title: "Delete draft", message: "The draft order will be removed.", confirmLabel: "Delete", danger: true })) && act(() => deleteDraft(orderId), listHref)}>Delete draft</button>
        )}
        {status === "ON_HOLD" && isAdmin && <button className="btn-primary" disabled={pending} onClick={() => act(() => approveHold(orderId))}>Approve overage</button>}
        {status === "APPROVED" && isOps && <button className="btn-primary" disabled={pending} onClick={() => act(() => packOrder(orderId))}>Start packing</button>}
        {(status === "PACKING" || status === "APPROVED") && isOps && <button className="btn" onClick={() => setShipOpen(!shipOpen)}>Enter tracking &amp; ship…</button>}
        {(status === "SHIPPED" || status === "DELIVERED") && isOps && <button className="btn" onClick={() => setFeeOpen(!feeOpen)}>Shipping fee…</button>}
        {status === "SHIPPED" && isOps && <button className="btn-primary" disabled={pending} onClick={() => act(() => deliverOrder(orderId))}>Mark delivered</button>}
        {canCancel && status !== "DRAFT" && (
          <button
            className="btn-danger"
            disabled={pending}
            onClick={async () => {
              const reason = await prompt({
                title: "Cancel order",
                message: "Charged credit and overage will be reversed.",
                input: { label: "Reason (optional)", multiline: true },
                confirmLabel: "Cancel order",
                danger: true,
              });
              if (reason !== null) act(() => cancelOrder(orderId, reason || undefined));
            }}
          >
            Cancel order
          </button>
        )}
      </div>
      {feeOpen && (
        <form action={feeAction} className="panel grid grid-cols-1 gap-2 p-3 sm:grid-cols-4">
          <input type="hidden" name="orderId" value={orderId} />
          <div><label className="label">New shipping fee ($)</label><input name="fee" required inputMode="decimal" className="input" placeholder="0.00 = waive" /></div>
          <div className="sm:col-span-3"><label className="label">Reason (required)</label><input name="reason" required minLength={3} className="input" placeholder="e.g. carrier re-weigh, free shipping promo" /></div>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
            <button className="btn-primary" disabled={feeSaving}>Update fee</button>
            <span className="text-xs text-gray-500">Raising it bills the difference; lowering removes what is owed and returns any part already paid to prepaid credit.</span>
            {feeState?.error && <span className="text-sm text-red">{feeState.error}</span>}
            {feeState?.ok && <span className="text-sm text-ok">{feeState.ok}</span>}
          </div>
        </form>
      )}
      {shipOpen && (status === "PACKING" || status === "APPROVED") && (
        <form action={shipAction} className="panel grid grid-cols-1 gap-2 p-3 sm:grid-cols-4">
          <input type="hidden" name="orderId" value={orderId} />
          <div><label className="label">Carrier</label><input name="carrier" required className="input" list="carriers" /></div>
          <datalist id="carriers"><option value="USPS" /><option value="UPS" /><option value="FedEx" /><option value="DHL" /></datalist>
          <div className="sm:col-span-2"><label className="label">Tracking #</label><input name="trackingNo" required className="input" /></div>
          <div><label className="label">Shipping fee ($)</label><input name="fee" required inputMode="decimal" className="input" placeholder="0.00" /></div>
          <div className="sm:col-span-4 flex items-center gap-2">
            <button className="btn-primary" disabled={shipping}>Confirm shipped</button>
            {shipState?.error && <span className="text-sm text-red">{shipState.error}</span>}
            {shipState?.ok && <span className="text-sm text-ok">{shipState.ok}</span>}
          </div>
        </form>
      )}
      {msg?.error && <p role="alert" className="border-l-4 border-red bg-red/5 px-3 py-2 text-sm text-red">{msg.error}</p>}
      {msg?.ok && <p className="border-l-4 border-ok bg-ok/5 px-3 py-2 text-sm text-ok">{msg.ok}</p>}
    </div>
  );
}
