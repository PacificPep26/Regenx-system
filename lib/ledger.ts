// Pure money rules for the partner program. All amounts are integer cents.
// Bucket sign convention (balance = SUM(amountCents)):
//   CREDIT      > 0  prepaid purchasing credit available
//   OUTSTANDING > 0  overage owed to RegenX
//   SHIPPING    > 0  shipping charges owed to RegenX

export type BucketName = "CREDIT" | "OUTSTANDING" | "SHIPPING";

export function priceOrder(items: { qty: number; unitPriceCents: number }[], discountBps: number) {
  if (items.length === 0) throw new Error("Order has no items");
  let subtotalCents = 0;
  for (const i of items) {
    if (!Number.isInteger(i.qty) || i.qty <= 0) throw new Error("Quantity must be a positive integer");
    subtotalCents += i.qty * i.unitPriceCents;
  }
  const totalCents = Math.round((subtotalCents * (10000 - discountBps)) / 10000);
  return { subtotalCents, totalCents };
}

export function splitCharge(creditBalanceCents: number, totalCents: number) {
  const creditAppliedCents = Math.min(Math.max(creditBalanceCents, 0), totalCents);
  return { creditAppliedCents, overageCents: totalCents - creditAppliedCents };
}

/** Ledger entries that undo an order's charge (on cancel). */
export function refundEntries(o: { creditAppliedCents: number; overageCents: number }) {
  const out: { bucket: BucketName; type: "ORDER_REFUND" | "OVERAGE_REVERSAL"; amountCents: number }[] = [];
  if (o.creditAppliedCents > 0) out.push({ bucket: "CREDIT", type: "ORDER_REFUND", amountCents: o.creditAppliedCents });
  if (o.overageCents > 0) out.push({ bucket: "OUTSTANDING", type: "OVERAGE_REVERSAL", amountCents: -o.overageCents });
  return out;
}

/** Payment order: outstanding overage, then shipping, remainder restores credit. */
export function allocatePayment(amountCents: number, owed: { outstandingCents: number; shippingCents: number }) {
  if (amountCents <= 0) throw new Error("Payment must be positive");
  let left = amountCents;
  const outstandingCents = Math.min(left, Math.max(owed.outstandingCents, 0));
  left -= outstandingCents;
  const shippingCents = Math.min(left, Math.max(owed.shippingCents, 0));
  left -= shippingCents;
  return { outstandingCents, shippingCents, creditCents: left };
}

export function statementFigures(b: {
  requiredBalanceCents: number;
  creditCents: number;
  outstandingCents: number;
  shippingCents: number;
}) {
  return {
    replenishDueCents: Math.max(0, b.requiredBalanceCents - b.creditCents),
    outstandingDueCents: Math.max(0, b.outstandingCents),
    shippingDueCents: Math.max(0, b.shippingCents),
  };
}

export const STATEMENT_TZ = "America/New_York";

function tzOffsetMs(utcMs: number, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(utcMs)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return wall - utcMs;
}

/** UTC instant of local midnight for a wall date (DST switches at 2am, so midnight is unambiguous). */
function zonedMidnight(y: number, m: number, d: number, tz: string) {
  const guess = Date.UTC(y, m, d);
  return new Date(guess - tzOffsetMs(guess, tz));
}

/** The last fully-closed Mon–Sun week before `now`, plus the due date (end of the following week). */
export function statementPeriod(now: Date, tz = STATEMENT_TZ) {
  const local = new Date(now.getTime() + tzOffsetMs(now.getTime(), tz));
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const monday = local.getUTCDate() - daysSinceMonday;
  return {
    periodStart: zonedMidnight(y, m, monday - 7, tz),
    periodEnd: zonedMidnight(y, m, monday, tz),
    dueAt: zonedMidnight(y, m, monday + 7, tz),
  };
}
