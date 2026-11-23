import Link from "next/link";
import { Download } from "lucide-react";
import { FilterBar, type Field } from "./FilterBar";
import { Empty, Money } from "./ui";
import { defaultRange, periodLabel, salesByPeriod, topProducts, type Scope, type Unit } from "@/lib/reports";
import { dateRange, flat, one, str, type SP } from "@/lib/query";

/** Daily / monthly sales report. Scope = one store, or every store (optionally filtered by store name/slug). */
export async function ReportView({ sp, scope, basePath, withStoreFilter }: { sp: SP; scope: Scope; basePath: string; withStoreFilter?: boolean }) {
  const unit: Unit = one(sp, "by", ["day", "month"] as const) ?? "day";
  const r = dateRange(sp, "from", "to");
  const def = defaultRange(unit);
  const from = r?.gte ?? def.from;
  const to = r?.lt ?? def.to;
  const storeQ = withStoreFilter ? str(sp, "store") : undefined;
  const sc: Scope = { ...scope, storeQ };

  const [rows, top] = await Promise.all([salesByPeriod(unit, from, to, sc), topProducts(from, to, sc)]);
  const total = rows.reduce((t, x) => ({ orders: t.orders + x.orders, units: t.units + x.units, wholesale: t.wholesale + x.wholesale, shipping: t.shipping + x.shipping }), { orders: 0, units: 0, wholesale: 0, shipping: 0 });
  const peak = Math.max(1, ...rows.map((x) => x.wholesale));

  const link = (by: Unit) => {
    const q = new URLSearchParams(Object.entries(flat(sp)).filter(([k, v]) => v && k !== "page") as [string, string][]);
    q.set("by", by);
    return `${basePath}?${q.toString()}`;
  };
  const csv = "/api/reports?" + new URLSearchParams({ by: unit, from: from.toISOString().slice(0, 10), to: new Date(to.getTime() - 86400000).toISOString().slice(0, 10), ...(scope.storeId ? { store: scope.storeId } : {}), ...(storeQ ? { storeQ } : {}) }).toString();

  const fields: Field[] = [
    ...(withStoreFilter ? [{ type: "search" as const, key: "store", placeholder: "Filter by store name or slug…" }] : []),
    { type: "date", from: "from", to: "to", label: "Period (submitted)" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex">
          {(["day", "month"] as const).map((u) => (
            <Link key={u} href={link(u)} className={`btn capitalize ${unit === u ? "border-navy bg-navy text-white hover:bg-navy" : ""}`}>{u === "day" ? "By day" : "By month"}</Link>
          ))}
        </div>
        <a href={csv} className="btn"><Download size={16} /> Export CSV</a>
      </div>
      <FilterBar fields={fields} />

      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 md:gap-2">
        <div className="panel border-l-4 border-navy p-2 md:p-3"><div className="label mb-0 text-[10px]">Orders</div><div className="text-lg font-bold">{total.orders}</div></div>
        <div className="panel border-l-4 border-navy p-2 md:p-3"><div className="label mb-0 text-[10px]">Units</div><div className="text-lg font-bold">{total.units}</div></div>
        <div className="panel border-l-4 border-ok p-2 md:p-3"><div className="label mb-0 text-[10px]">Wholesale</div><div className="text-lg font-bold"><Money cents={total.wholesale} /></div></div>
        <div className="panel border-l-4 border-line p-2 md:p-3"><div className="label mb-0 text-[10px]">Shipping billed</div><div className="text-lg font-bold"><Money cents={total.shipping} /></div></div>
      </div>

      {!rows.length ? (
        <Empty>No orders in this period.</Empty>
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full sm:min-w-[520px]">
            <thead><tr><th className="th">{unit === "day" ? "Day" : "Month"}</th><th className="th text-right">Orders</th><th className="th text-right">Units</th><th className="th w-1/3">Wholesale</th><th className="th text-right">Shipping</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.period.toISOString()} className="hover:bg-hover">
                  <td className="td whitespace-nowrap">{periodLabel(x.period, unit)}</td>
                  <td className="td text-right tabular-nums">{x.orders}</td>
                  <td className="td text-right tabular-nums">{x.units}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="hidden h-3 flex-1 bg-soft sm:block"><div className="h-full bg-navy" style={{ width: `${Math.max(2, (x.wholesale / peak) * 100)}%` }} /></div>
                      <span className="ml-auto w-24 shrink-0 text-right text-sm font-semibold tabular-nums"><Money cents={x.wholesale} /></span>
                    </div>
                  </td>
                  <td className="td text-right tabular-nums"><Money cents={x.shipping} /></td>
                </tr>
              ))}
              <tr><td className="td font-bold">Total</td><td className="td text-right font-bold">{total.orders}</td><td className="td text-right font-bold">{total.units}</td><td className="td text-right font-bold"><Money cents={total.wholesale} /></td><td className="td text-right font-bold"><Money cents={total.shipping} /></td></tr>
            </tbody>
          </table>
        </div>
      )}

      {top.length > 0 && (
        <section>
          <h2 className="label mb-2">Top products in this period</h2>
          <ul className="divide-y divide-line border border-line">
            {top.map((p) => (
              <li key={p.sku} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate"><b>{p.name}</b> <span className="text-gray-500">{p.strength}</span></span>
                <span className="shrink-0 text-xs tabular-nums"><b>{p.units}</b> units · {p.orders} order(s)</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
