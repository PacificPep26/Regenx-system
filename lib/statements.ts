import "server-only";
import { db } from "./db";
import { getBalances } from "./balances";
import { statementFigures, statementPeriod } from "./ledger";
import { notify } from "./notify";
import { formatUSD } from "./money";

/** Idempotent: one statement per store per week (unique storeId+periodStart). */
export async function runWeeklyStatements(now = new Date()) {
  const { periodStart, periodEnd, dueAt } = statementPeriod(now);

  // anything past due and still unpaid becomes OVERDUE (blocks new orders)
  const overdue = await db.statement.updateMany({ where: { status: "ISSUED", dueAt: { lte: now } }, data: { status: "OVERDUE" } });

  // retention: notifications are ephemeral; keep 90 days so the table (and its unread counts) stay small
  const pruned = await db.notification.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * 86400000) } } });

  const stores = await db.store.findMany({ where: { status: "ACTIVE" } });
  const created: string[] = [];
  for (const store of stores) {
    const exists = await db.statement.findUnique({ where: { storeId_periodStart: { storeId: store.id, periodStart } } });
    if (exists) continue;
    const opening = await getBalances(store.id, { before: periodStart });
    const closing = await getBalances(store.id, { before: periodEnd });
    const debits = await db.ledgerEntry.aggregate({
      where: { storeId: store.id, bucket: "CREDIT", type: { in: ["ORDER_DEBIT", "ORDER_REFUND"] }, createdAt: { gte: periodStart, lt: periodEnd } },
      _sum: { amountCents: true },
    });
    const f = statementFigures({
      requiredBalanceCents: store.requiredBalanceCents,
      creditCents: closing.CREDIT,
      outstandingCents: closing.OUTSTANDING,
      shippingCents: closing.SHIPPING,
    });
    const settled = f.replenishDueCents === 0 && f.outstandingDueCents === 0 && f.shippingDueCents === 0;
    const st = await db.$transaction(async (tx) => {
      const st = await tx.statement.create({
        data: {
          storeId: store.id,
          periodStart,
          periodEnd,
          dueAt,
          openingCreditCents: opening.CREDIT,
          debitsCents: -(debits._sum.amountCents ?? 0),
          closingCreditCents: closing.CREDIT,
          ...f,
          status: settled ? "PAID" : "ISSUED",
        },
      });
      const due = f.replenishDueCents + f.outstandingDueCents + f.shippingDueCents;
      await notify(tx, {
        audience: "STORE",
        storeId: store.id,
        title: settled ? "Weekly statement issued · nothing due" : `Weekly statement · ${formatUSD(due)} due`,
        link: `/s/${store.slug}/statements/${st.id}`,
      });
      return st;
    });
    created.push(st.id);
    await emailStatement(store.id, st.id).catch((e) => console.error("statement email failed", st.id, e));
  }
  return { periodStart, periodEnd, created: created.length, markedOverdue: overdue.count, prunedNotifications: pruned.count };
}

/** Optional email via Resend's HTTP API (no SDK). Skipped when RESEND_API_KEY is unset. */
async function emailStatement(storeId: string, statementId: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const owners = await db.user.findMany({ where: { storeId, role: "PARTNER_OWNER", active: true }, select: { email: true } });
  const st = await db.statement.findUniqueOrThrow({ where: { id: statementId }, include: { store: true } });
  if (!owners.length) return;
  const base = process.env.APP_URL ?? "";
  const html = `<p>Weekly statement for <b>${st.store.name}</b></p>
<table cellpadding="4">
<tr><td>Opening credit</td><td>${formatUSD(st.openingCreditCents)}</td></tr>
<tr><td>Orders deducted</td><td>${formatUSD(st.debitsCents)}</td></tr>
<tr><td>Remaining credit</td><td>${formatUSD(st.closingCreditCents)}</td></tr>
<tr><td><b>Replenishment required</b></td><td><b>${formatUSD(st.replenishDueCents)}</b></td></tr>
<tr><td><b>Outstanding (overage)</b></td><td><b>${formatUSD(st.outstandingDueCents)}</b></td></tr>
<tr><td><b>Shipping due</b></td><td><b>${formatUSD(st.shippingDueCents)}</b></td></tr>
</table>
<p><a href="${base}/s/${st.store.slug}/statements/${st.id}">View statement</a></p>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.STATEMENT_FROM_EMAIL, to: owners.map((o) => o.email), subject: `RegenX weekly statement · ${st.store.name}`, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
