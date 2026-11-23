// One-off: reserve stock for orders approved before stock control existed. Safe to re-run (idempotent).
import { db } from "../lib/db";
import { reserveOrder } from "../lib/stock";

async function main() {
  const open = await db.order.findMany({ where: { status: { in: ["APPROVED", "PACKING"] } }, select: { id: true, number: true } });
  for (const o of open) await db.$transaction((tx) => reserveOrder(tx, o.id, null));
  console.log(`reserved stock for ${open.length} open order(s)`);
}
main().finally(() => db.$disconnect());
