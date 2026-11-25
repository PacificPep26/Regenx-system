import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { dateRange, type SP } from "@/lib/query";
import { earningsByDay, payoutSummary } from "@/lib/gpEarnings";
import { FilterBar } from "@/components/FilterBar";
import { RequestPayoutButton } from "@/components/PayoutButtons";
import { Badge, Empty, Money, PageHeader, fmtDate, fmtDateTime } from "@/components/ui";

const DAY = 86400000;

/** GP: what was earned each day, what was paid, and a request-payout button. */
export default async function Earnings({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireRole("FULFILLMENT", "ADMIN");
  const sp = await searchParams;
  const r = dateRange(sp, "from", "to");
  const from = r?.gte ?? new Date(Date.now() - 30 * DAY);
  const to = r?.lt ?? new Date(Date.now() + DAY);
  const [days, sum, payouts, recent] = await Promise.all([
    earningsByDay(from, to),
    payoutSummary(),
    db.gpPayout.findMany({ orderBy: { requestedAt: "desc" }, take: 20 }),
    earningsByDay(new Date(Date.now() - 90 * DAY), new Date(Date.now() + DAY)), // days offered in the payout dialog
  ]);

  // New York calendar days for the dialog presets
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }) + "T00:00:00Z");
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY);
  const presets = [
    { key: "yesterday", label: "Yesterday", from: iso(new Date(today.getTime() - DAY)), to: iso(new Date(today.getTime() - DAY)) },
    { key: "week", label: "This week (Mon-today)", from: iso(monday), to: iso(today) },
    { key: "lastweek", label: "Last week (Mon-Sun)", from: iso(new Date(monday.getTime() - 7 * DAY)), to: iso(new Date(monday.getTime() - DAY)) },
  ];

  // group the day rows into Monday-start weeks
  const weeks = new Map<string, { units: number; cents: number }>();
  for (const d of days) {
    const t = new Date(d.day + "T00:00:00Z");
    const monday = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
    const w = weeks.get(monday) ?? { units: 0, cents: 0 };
    weeks.set(monday, { units: w.units + d.units, cents: w.cents + d.cents });
  }
  const total = days.reduce((n, d) => ({ units: n.units + d.units, cents: n.cents + d.cents, orders: n.orders + d.orders }), { units: 0, cents: 0, orders: 0 });
  const max = Math.max(1, ...days.map((d) => d.cents));

  return (
    <div className="space-y-4">
      <PageHeader title="Earnings" actions={u.role === "FULFILLMENT" ? <RequestPayoutButton available={sum.available} blocked={sum.pending > 0} presets={presets} days={recent.map((d) => ({ day: d.day, cents: d.cents }))} /> : undefined} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Box label="Total earned" cents={sum.earned} />
        <Box label="Paid to you" cents={sum.paid} tone="ok" />
        <Box label="Waiting for approval" cents={sum.pending} tone={sum.pending ? "warn" : "navy"} />
        <Box label="Available to request" cents={sum.available} tone="red" />
      </div>

      <FilterBar fields={[{ type: "date", from: "from", to: "to", label: "Day" }]} />

      <section>
        <h2 className="label mb-2">By day · {total.orders} order(s) · {total.units} unit(s) · <Money cents={total.cents} className="font-bold" /></h2>
        {days.length ? (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[420px]">
              <thead>
                <tr><th className="th">Day</th><th className="th text-right">Orders</th><th className="th text-right">Units</th><th className="th text-right">Earned</th><th className="th w-1/4" /></tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day}>
                    <td className="td">{fmtDate(new Date(d.day + "T12:00:00Z"))}</td>
                    <td className="td text-right">{d.orders}</td>
                    <td className="td text-right">{d.units}</td>
                    <td className="td text-right font-bold"><Money cents={d.cents} /></td>
                    <td className="td"><div className="h-2 bg-ok" style={{ width: `${(d.cents / max) * 100}%` }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No shipments in this period.</Empty>
        )}
      </section>

      {weeks.size > 0 && (
        <section>
          <h2 className="label mb-2">By week (Mon–Sun)</h2>
          <ul className="divide-y divide-line border border-line">
            {[...weeks].map(([monday, w]) => (
              <li key={monday} className="flex justify-between p-3 text-sm">
                <span>Week of {fmtDate(new Date(monday + "T12:00:00Z"))}</span>
                <span>{w.units} unit(s) · <Money cents={w.cents} className="font-bold" /></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="label mb-2">Payout requests</h2>
        {payouts.length ? (
          <ul className="divide-y divide-line border border-line">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span><Money cents={p.amountCents} className="font-bold" /> · {fmtDateTime(p.requestedAt)}{p.periodFrom ? <span className="text-gray-500"> · for {p.periodFrom === p.periodTo ? p.periodFrom : `${p.periodFrom} → ${p.periodTo}`}</span> : null}{p.note ? <span className="text-gray-500"> · {p.note}</span> : null}</span>
                <span className="flex items-center gap-2">
                  {p.method && <span className="text-xs text-gray-500">{p.method}{p.reference ? ` · ${p.reference}` : ""}</span>}
                  <Badge value={p.status} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No requests yet.</Empty>
        )}
      </section>
    </div>
  );
}

function Box({ label, cents, tone = "navy" }: { label: string; cents: number; tone?: "navy" | "red" | "ok" | "warn" }) {
  const c = { navy: "border-t-navy", red: "border-t-red", ok: "border-t-ok", warn: "border-t-warn" }[tone];
  return (
    <div className={`panel border-t-4 ${c} p-3 text-center`}>
      <div className="text-xl font-bold md:text-2xl"><Money cents={cents} /></div>
      <div className="label mb-0">{label}</div>
    </div>
  );
}
