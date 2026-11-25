import "server-only";
import { db, type Tx } from "./db";
import { audit } from "./audit";
import { notify } from "./notify";
import { UserError } from "./orders";
import { formatUSD } from "./money";
import { GP_FEE_PER_UNIT_CENTS } from "./gpFee";

type Actor = { id: string; role: string };

export type DayRow = { day: string; orders: number; units: number; cents: number };

// shortcut: the fee is applied to history at today's rate (not stored per order); store it per order if the rate ever changes
const fee = (units: number) => units * GP_FEE_PER_UNIT_CENTS;

/** Packed-and-shipped units per New York day, newest first. `from` inclusive, `to` exclusive. */
export async function earningsByDay(from: Date, to: Date): Promise<DayRow[]> {
  const rows = await db.$queryRaw<{ day: string; orders: number; units: number }[]>`
    SELECT to_char((o."shippedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS day,
           COUNT(DISTINCT o.id)::int AS orders, SUM(i.qty)::int AS units
    FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o.id
    WHERE o.status IN ('SHIPPED', 'DELIVERED') AND o."shippedAt" >= ${from} AND o."shippedAt" < ${to}
    GROUP BY 1 ORDER BY 1 DESC`;
  return rows.map((r) => ({ ...r, cents: fee(r.units) }));
}

export async function payoutSummary(tx: Pick<Tx, "$queryRaw" | "gpPayout"> = db) {
  const [{ units }] = await tx.$queryRaw<{ units: number }[]>`
    SELECT COALESCE(SUM(i.qty), 0)::int AS units FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o.id
    WHERE o.status IN ('SHIPPED', 'DELIVERED')`;
  const sums = await tx.gpPayout.groupBy({ by: ["status"], _sum: { amountCents: true } });
  const sum = (s: string) => sums.find((x) => x.status === s)?._sum.amountCents ?? 0;
  const earned = fee(units);
  const paid = sum("PAID");
  const pending = sum("REQUESTED");
  return { earned, paid, pending, available: earned - paid - pending };
}

const lock = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(7001)`; // one payout change at a time

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `period` (optional): New York days the request is for; the amount cannot exceed what was earned in them. */
export function requestPayout(actor: Actor, amountCents: number, period?: { from: string; to: string }) {
  return db.$transaction(async (tx) => {
    await lock(tx);
    if (actor.role !== "FULFILLMENT") throw new UserError("Only the packing partner can request a payout.");
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new UserError("Enter an amount above zero.");
    if (await tx.gpPayout.count({ where: { status: "REQUESTED" } })) throw new UserError("You already have a request waiting for approval.");
    const s = await payoutSummary(tx);
    if (amountCents > s.available) throw new UserError(`You can request up to ${formatUSD(s.available)}.`);
    if (period) {
      if (!DAY_RE.test(period.from) || !DAY_RE.test(period.to) || period.from > period.to) throw new UserError("Choose a valid period.");
      const days = await earningsByDay(new Date(period.from + "T05:00:00Z"), new Date(new Date(period.to + "T05:00:00Z").getTime() + 86400000));
      const earnedIn = days.reduce((n, d) => n + d.cents, 0);
      if (amountCents > earnedIn) throw new UserError(`You earned ${formatUSD(earnedIn)} in that period.`);
    }
    const p = await tx.gpPayout.create({ data: { amountCents, requestedById: actor.id, periodFrom: period?.from, periodTo: period?.to } });
    await notify(tx, { audience: "ADMIN", title: `GP requested a payout of ${formatUSD(amountCents)}`, link: "/payouts" });
    await audit(tx, actor.id, "gp.payout_request", "GpPayout", p.id, { amountCents });
    return p.id;
  });
}

export function resolvePayout(id: string, actor: Actor, r: { status: "PAID" | "REJECTED"; method?: string; reference?: string; note?: string }) {
  return db.$transaction(async (tx) => {
    await lock(tx);
    if (actor.role !== "ADMIN") throw new UserError("Only an admin can resolve a payout.");
    const p = await tx.gpPayout.findUniqueOrThrow({ where: { id } });
    if (p.status !== "REQUESTED") throw new UserError("This request is already resolved.");
    if (r.status === "REJECTED" && !r.note?.trim()) throw new UserError("A reason is required to reject.");
    await tx.gpPayout.update({ where: { id }, data: { status: r.status, resolvedById: actor.id, resolvedAt: new Date(), method: r.method || null, reference: r.reference || null, note: r.note?.trim() || null } });
    const paid = r.status === "PAID";
    await notify(tx, { audience: "FULFILLMENT", title: `Payout ${formatUSD(p.amountCents)} ${paid ? "paid" : "rejected"}`, body: r.note?.trim(), link: "/earnings" });
    await audit(tx, actor.id, paid ? "gp.payout_paid" : "gp.payout_rejected", "GpPayout", id, { amountCents: p.amountCents });
  });
}
