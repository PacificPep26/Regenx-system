import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, isPartner } from "@/lib/auth";
import { str, centsRange, pageOf, flat, sortOf, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { Empty, Money, PageHeader, Pager } from "@/components/ui";
import { ProductRow } from "./ProductRow";
import { NewProduct } from "./NewProduct";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const admin = u.role === "ADMIN";
  const partner = isPartner(u);
  const discountBps = partner ? (u.store?.discountBps ?? 0) : 0;
  const showMoney = u.role !== "FULFILLMENT" && !(u.role === "PARTNER_STAFF" && u.store?.hideAmountsFromStaff);

  const and: Prisma.ProductWhereInput[] = [];
  if (partner) and.push({ active: true, ...(u.store?.allowRestricted ? {} : { restricted: false }) });
  const q = str(sp, "q");
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    and.push({ OR: [{ name: c }, { sku: c }, { sourceCode: c }, { strength: c }, { notes: c }] });
  }
  const st = str(sp, "state");
  if (admin && st === "active") and.push({ active: true });
  if (admin && st === "inactive") and.push({ active: false });
  const rs = str(sp, "restricted");
  if (!partner && rs === "yes") and.push({ restricted: true });
  if (!partner && rs === "no") and.push({ restricted: false });
  const code = str(sp, "code");
  if (code === "missing") and.push({ sourceCode: null });
  const price = centsRange(sp, "min", "max");
  if (price) and.push({ basePriceCents: price });
  const where = { AND: and };

  const { page, skip, take } = pageOf(sp, 50);
  const [rows, count] = await Promise.all([
    db.product.findMany({ where, orderBy: [sortOf(sp, ["name", "basePriceCents", "sku"] as const, "name_asc"), { basePriceCents: "asc" }], skip, take, include: { docs: { orderBy: { createdAt: "asc" } } } }),
    db.product.count({ where }),
  ]);

  return (
    <div>
      <PageHeader title={partner ? `Price list${discountBps ? ` · your price −${discountBps / 100}%` : ""}` : "Catalog"} />
      {admin && <NewProduct />}
      <FilterBar
        fields={[
          { type: "search", key: "q", placeholder: "Search product, SKU, code, strength…" },
          ...(admin ? [{ type: "select" as const, key: "state", label: "State", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }] : []),
          ...(!partner ? [{ type: "select" as const, key: "restricted", label: "Restricted", options: [{ value: "yes", label: "Restricted" }, { value: "no", label: "Not restricted" }] }] : []),
          ...(!partner ? [{ type: "select" as const, key: "code", label: "Source code", options: [{ value: "missing", label: "Missing code" }] }] : []),
          ...(showMoney ? [{ type: "range" as const, min: "min", max: "max", label: "Base price" }] : []),
          { type: "select", key: "sort", label: "Sort", options: [{ value: "name_asc", label: "Name" }, { value: "basePriceCents_asc", label: "Price low" }, { value: "basePriceCents_desc", label: "Price high" }, { value: "sku_asc", label: "SKU" }] },
        ]}
      />
      <div className="mb-2 text-xs text-gray-500">{count} product(s)</div>
      {!rows.length ? (
        <Empty />
      ) : admin ? (
        <ul className="divide-y divide-line border border-line">
          {rows.map((p) => <ProductRow key={p.id} p={p} />)}
        </ul>
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Product</th>
                <th className="th">Strength</th>
                <th className="th hidden sm:table-cell">SKU</th>
                {showMoney && <th className="th text-right">{partner ? "Your price" : "Base"}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-hover">
                  <td className="td">{p.name}{p.restricted && <span className="ml-1 border border-red px-1 text-[10px] text-red">RESTRICTED</span>}<div className="text-xs text-gray-400 sm:hidden">{p.sku}</div>{p.docs.length > 0 && <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs">{p.docs.map((d) => <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="text-navy underline">{d.title}</a>)}</div>}</td>
                  <td className="td whitespace-nowrap">{p.strength}</td>
                  <td className="td hidden text-xs text-gray-500 sm:table-cell">{p.sku}{p.sourceCode ? ` · ${p.sourceCode}` : ""}{p.upc ? ` · UPC ${p.upc}` : ""}</td>
                  {showMoney && <td className="td text-right font-semibold"><Money cents={Math.round((p.basePriceCents * (10000 - discountBps)) / 10000)} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
    </div>
  );
}
