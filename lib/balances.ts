import type { Bucket } from "@prisma/client";
import type { Tx } from "./db";
import { db } from "./db";

export type Balances = Record<Bucket, number>;

const pick = (s: { creditCents: number; outstandingCents: number; shippingCents: number } | null): Balances => ({
  CREDIT: s?.creditCents ?? 0,
  OUTSTANDING: s?.outstandingCents ?? 0,
  SHIPPING: s?.shippingCents ?? 0,
});

/** Current balances are cached on Store by DB triggers (see the scale migration); only historical ones sum the journal. */
export async function getBalances(storeId: string, opts: { before?: Date; tx?: Tx } = {}): Promise<Balances> {
  const client = opts.tx ?? db;
  if (!opts.before) {
    return pick(await client.store.findUnique({ where: { id: storeId }, select: { creditCents: true, outstandingCents: true, shippingCents: true } }));
  }
  const rows = await client.ledgerEntry.groupBy({ by: ["bucket"], where: { storeId, createdAt: { lt: opts.before } }, _sum: { amountCents: true } });
  const b: Balances = { CREDIT: 0, OUTSTANDING: 0, SHIPPING: 0 };
  for (const r of rows) b[r.bucket] = r._sum.amountCents ?? 0;
  return b;
}

/** Balances for many stores in one indexed read (pass ids to limit it to the stores on screen). */
export async function getAllBalances(ids?: string[]) {
  const rows = await db.store.findMany({ where: ids ? { id: { in: ids } } : {}, select: { id: true, creditCents: true, outstandingCents: true, shippingCents: true } });
  const map = new Map(rows.map((r) => [r.id, pick(r)]));
  return (id: string) => map.get(id) ?? pick(null);
}

/** green: healthy, yellow: credit < 30% of required, red: overdue statement or credit exhausted with outstanding */
export function health(b: Balances, required: number, overdue: boolean): "green" | "yellow" | "red" {
  if (overdue) return "red";
  if (b.CREDIT < required * 0.3 || b.OUTSTANDING > 0) return "yellow";
  return "green";
}
