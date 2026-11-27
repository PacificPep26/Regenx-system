import "server-only";
import { db } from "./db";
import { audit } from "./audit";
import { notify } from "./notify";
import { formatUSD } from "./money";
import { UserError, recordPayment } from "./orders";

type Actor = { id: string; role: string };

/** A partner owner asks the admin to add funds (the admin then records the payment). */
export function requestTopUp(storeId: string, actor: Actor, amountCents: number, note?: string) {
  return db.$transaction(async (tx) => {
    if (actor.role !== "PARTNER_OWNER") throw new UserError("Only the store owner can request a top-up.");
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new UserError("Enter an amount above zero.");
    if (await tx.topUpRequest.count({ where: { storeId, status: "REQUESTED" } })) throw new UserError("You already have a top-up request waiting.");
    const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
    const r = await tx.topUpRequest.create({ data: { storeId, amountCents, note: note?.trim().slice(0, 300) || null, requestedById: actor.id } });
    await notify(tx, { audience: "ADMIN", storeId, title: `${store.name} requests a top-up of ${formatUSD(amountCents)}`, body: note?.trim(), link: "/topups" });
    await audit(tx, actor.id, "topup.request", "TopUpRequest", r.id, { amountCents });
    return r.id;
  });
}

/** Admin: record the money that arrived (normal payment allocation) and close the request. */
export async function fulfillTopUp(id: string, actor: Actor, p: { amountCents: number; method: string; reference?: string }) {
  if (actor.role !== "ADMIN") throw new UserError("Only an admin can record a payment.");
  const r = await db.topUpRequest.findUniqueOrThrow({ where: { id } });
  if (r.status !== "REQUESTED") throw new UserError("This request is already closed.");
  await recordPayment(r.storeId, actor, p);
  await db.topUpRequest.update({ where: { id }, data: { status: "DONE", resolvedAt: new Date() } });
  await audit(db, actor.id, "topup.done", "TopUpRequest", id, { amountCents: p.amountCents });
}

export async function dismissTopUp(id: string, actor: Actor) {
  if (actor.role !== "ADMIN") throw new UserError("Only an admin can dismiss a request.");
  const r = await db.topUpRequest.findUniqueOrThrow({ where: { id } });
  if (r.status !== "REQUESTED") throw new UserError("This request is already closed.");
  await db.topUpRequest.update({ where: { id }, data: { status: "DISMISSED", resolvedAt: new Date() } });
  await audit(db, actor.id, "topup.dismiss", "TopUpRequest", id);
}
