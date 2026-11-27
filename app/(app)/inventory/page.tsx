import { ChevronDown } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { flat, pageOf, str, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { ReportMismatchButton } from "@/components/ReportMismatchButton";
import { Empty, PageHeader, Pager } from "@/components/ui";

/** GP/admin: what every store has in its own stock at GP, by product, so the physical shelves and the system stay in sync. Quantities only. */
export default async function AllInventory({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireRole("ADMIN", "FULFILLMENT");
  const sp = await searchParams;
  const q = str(sp, "q");
  const storeSlug = str(sp, "store");
  const { page, skip, take } = pageOf(sp, 20); // 20 products per page
  const [stores, rows] = await Promise.all([
    db.store.findMany({ where: { inventoryMode: true }, orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    db.storeStock.findMany({
      where: {
        OR: [{ onHand: { not: 0 } }, { reserved: { not: 0 } }],
        ...(storeSlug ? { store: { slug: storeSlug } } : {}),
        ...(q ? { product: { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } } : {}),
      },
      orderBy: [{ product: { name: "asc" } }, { product: { strength: "asc" } }],
      take: 5000, // a few hundred SKUs x a few dozen stores
      include: { product: { select: { name: true, strength: true, sku: true } }, store: { select: { name: true, slug: true } } },
    }),
  ]);

  // product name -> size (product id) -> the stores holding it
  const byName = new Map<string, Map<string, typeof rows>>();
  for (const r of rows) {
    const k = r.product.name.trim().toLowerCase();
    const sizes = byName.get(k) ?? new Map<string, typeof rows>();
    sizes.set(r.productId, [...(sizes.get(r.productId) ?? []), r]);
    byName.set(k, sizes);
  }
  const groups = [...byName.values()];
  const pageGroups = groups.slice(skip, skip + take);
  const sum = (rs: typeof rows, f: (r: (typeof rows)[number]) => number) => rs.reduce((n, r) => n + f(r), 0);
  const totalOnHand = sum(rows, (r) => r.onHand);
  const totalReserved = sum(rows, (r) => r.reserved);

  return (
    <div className="space-y-4">
      <PageHeader title="Store inventory" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {([["Products", groups.length], ["Stores", new Set(rows.map((r) => r.storeId)).size], ["On hand", totalOnHand], ["Reserved", totalReserved]] as const).map(([l, n]) => (
          <div key={l} className="panel border-t-4 border-t-navy p-3 text-center"><div className="text-xl font-bold tabular-nums">{n}</div><div className="label mb-0">{l}</div></div>
        ))}
      </div>
      <FilterBar
        fields={[
          { type: "search", key: "q", placeholder: "Search product or SKU…" },
          { type: "select", key: "store", label: "Store", options: stores.map((s) => ({ value: s.slug, label: s.name })) },
        ]}
      />
      {groups.length ? (
        <>
          <ul className="divide-y divide-line border border-line">
            {pageGroups.map((sizes) => {
              const all = [...sizes.values()].flat();
              const name = all[0].product.name;
              return (
                <li key={name}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm hover:bg-hover [&::-webkit-details-marker]:hidden">
                      <ChevronDown size={14} className="shrink-0 -rotate-90 text-gray-400 transition-transform group-open:rotate-0" />
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {name}
                        {sizes.size === 1 && <span className="font-normal text-gray-500"> {all[0].product.strength}</span>}
                      </span>
                      {sizes.size > 1 && <span className="shrink-0 text-xs text-gray-400">{sizes.size} sizes</span>}
                      <span className="shrink-0 text-right text-xs tabular-nums text-gray-500">
                        <b className="text-base text-navy">{sum(all, (r) => r.onHand)}</b> on hand
                      </span>
                    </summary>
                    <ul className="divide-y divide-line border-t border-line bg-soft">
                      {[...sizes.values()].map((rs) => (
                        <li key={rs[0].productId} className="px-3 py-2 pl-8 text-sm">
                          <div className="flex items-baseline justify-between gap-2">
                            <span><b>{rs[0].product.strength}</b> <span className="break-all text-[11px] text-gray-400">{rs[0].product.sku}</span></span>
                            <span className="shrink-0 tabular-nums text-xs text-gray-600"><b className="text-sm text-navy">{sum(rs, (r) => r.onHand)}</b> on hand{sum(rs, (r) => r.reserved) ? ` · ${sum(rs, (r) => r.reserved)} reserved` : ""}</span>
                          </div>
                          <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                            {rs.map((r) => (
                              <li key={r.storeId} className="flex items-center justify-between gap-2">
                                <span className="truncate">{r.store.name}</span>
                                <span className="flex shrink-0 items-center gap-2 tabular-nums">
                                  <span>{r.onHand}{r.reserved ? <span className="text-gray-400"> · {r.reserved} reserved</span> : null}</span>
                                  {user.role === "FULFILLMENT" && <ReportMismatchButton storeId={r.storeId} productId={r.productId} name={`${r.product.name} ${r.product.strength}`} system={r.onHand} />}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
          <Pager page={page} pages={Math.ceil(groups.length / take)} params={flat(sp)} />
        </>
      ) : (
        <Empty>{q || storeSlug ? "No match." : "No store has inventory yet."}</Empty>
      )}
    </div>
  );
}
