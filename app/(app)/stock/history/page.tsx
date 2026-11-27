import Link from "next/link";
import type { Prisma, StockType } from "@prisma/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { hasLegacyStores } from "@/lib/legacyStock";
import { str, list, dateRange, pageOf, flat, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { Empty, PageHeader, Pager } from "@/components/ui";

const TYPES: StockType[] = ["RECEIPT", "ADJUST", "RESERVE", "RELEASE", "SHIP"];
const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

export default async function StockHistory({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole("ADMIN", "FULFILLMENT");
  if (!(await hasLegacyStores())) redirect("/inventory"); // every store is on inventory mode: GP's warehouse is the stores' inventory
  const sp = await searchParams;
  const q = str(sp, "q");
  const types = list(sp, "type", TYPES);
  const range = dateRange(sp, "from", "to");
  const where: Prisma.StockMovementWhereInput = {
    ...(q ? { OR: [{ product: { name: { contains: q, mode: "insensitive" } } }, { product: { sku: { contains: q, mode: "insensitive" } } }, { memo: { contains: q, mode: "insensitive" } }] } : {}),
    ...(types ? { type: { in: types } } : {}),
    ...(range ? { createdAt: range } : {}),
  };
  const { page, skip, take } = pageOf(sp, 40);
  const [rows, count] = await Promise.all([
    db.stockMovement.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { product: { select: { name: true, strength: true, sku: true } } } }),
    db.stockMovement.count({ where }),
  ]);
  const [users, orders] = await Promise.all([
    db.user.findMany({ where: { id: { in: rows.map((r) => r.createdById).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    db.order.findMany({ where: { id: { in: rows.map((r) => r.orderId).filter((x): x is string => !!x) } }, select: { id: true, number: true, store: { select: { name: true } } } }),
  ]);
  const who = new Map(users.map((u) => [u.id, u.name]));
  const ord = new Map(orders.map((o) => [o.id, o]));

  return (
    <div className="space-y-3">
      <PageHeader title="Stock history" actions={<Link href="/stock" className="btn">Back to stock</Link>} />
      <FilterBar
        fields={[
          { type: "search", key: "q", placeholder: "Search product, SKU or note…" },
          { type: "multi", key: "type", label: "Type", options: TYPES.map((t) => ({ value: t, label: t.toLowerCase() })) },
          { type: "date", from: "from", to: "to", label: "Date" },
        ]}
      />
      {!rows.length ? (
        <Empty>No movements.</Empty>
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">When</th><th className="th">Product</th><th className="th">Type</th><th className="th text-right">On hand</th><th className="th text-right">Reserved</th><th className="th">Order / note</th><th className="th">By</th></tr></thead>
            <tbody>
              {rows.map((m) => {
                const o = m.orderId ? ord.get(m.orderId) : null;
                return (
                  <tr key={m.id}>
                    <td className="td whitespace-nowrap text-xs">{m.createdAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="td text-sm">{m.product.name} <span className="text-gray-500">{m.product.strength}</span><div className="text-xs text-gray-400">{m.product.sku}</div></td>
                    <td className="td text-xs font-semibold uppercase">{m.type.toLowerCase()}</td>
                    <td className={`td text-right tabular-nums ${m.onHandDelta > 0 ? "text-ok" : m.onHandDelta < 0 ? "text-red" : "text-gray-300"}`}>{m.onHandDelta ? sign(m.onHandDelta) : "·"}</td>
                    <td className="td text-right tabular-nums text-gray-600">{m.reservedDelta ? sign(m.reservedDelta) : "·"}</td>
                    <td className="td text-xs">{o && <Link className="text-navy underline" href={`/fulfillment/${m.orderId}`}>{o.store.name} #{o.number}</Link>} {m.memo}</td>
                    <td className="td text-xs">{m.createdById ? (who.get(m.createdById) ?? "—") : "system"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
    </div>
  );
}
