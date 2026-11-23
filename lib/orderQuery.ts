import type { OrderStatus, Prisma } from "@prisma/client";
import { str, list, dateRange, centsRange, sortOf, type SP } from "./query";

export const ORDER_STATUSES = ["DRAFT", "ON_HOLD", "APPROVED", "PACKING", "SHIPPED", "DELIVERED", "CANCELLED"] as const satisfies readonly OrderStatus[];

export function orderWhere(sp: SP, base: Prisma.OrderWhereInput = {}): Prisma.OrderWhereInput {
  const q = str(sp, "q");
  const and: Prisma.OrderWhereInput[] = [base];
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    const num = Number(q.replace(/^#/, ""));
    and.push({
      OR: [
        ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : []),
        { externalRef: c },
        { trackingNo: c },
        { shipName: c },
        { shipCity: c },
        { notes: c },
        { customer: { OR: [{ name: c }, { email: c }, { phone: c }] } },
        { items: { some: { product: { OR: [{ sku: c }, { name: c }, { sourceCode: c }] } } } },
        { store: { name: c } },
      ],
    });
  }
  const status = list(sp, "status", ORDER_STATUSES);
  if (status) and.push({ status: { in: status } });
  const created = dateRange(sp, "from", "to");
  if (created) and.push({ createdAt: created });
  const shipped = dateRange(sp, "sfrom", "sto");
  if (shipped) and.push({ shippedAt: shipped });
  const total = centsRange(sp, "min", "max");
  if (total) and.push({ totalCents: total });
  const region = str(sp, "region");
  if (region) and.push({ shipRegion: region.toUpperCase() });
  const carrier = str(sp, "carrier");
  if (carrier) and.push({ carrier: { equals: carrier, mode: "insensitive" } });
  const store = str(sp, "store");
  if (store) and.push({ store: { slug: store } });
  const tracking = str(sp, "tracking");
  if (tracking === "yes") and.push({ trackingNo: { not: null } });
  if (tracking === "no") and.push({ trackingNo: null });
  const product = str(sp, "product");
  if (product) and.push({ items: { some: { productId: product } } });
  return { AND: and };
}

export const orderSort = (sp: SP) => sortOf(sp, ["createdAt", "totalCents", "number", "submittedAt", "shippedAt"] as const, "createdAt_desc");

export const SORT_OPTIONS = [
  { value: "createdAt_desc", label: "Newest" },
  { value: "createdAt_asc", label: "Oldest" },
  { value: "totalCents_desc", label: "Total high → low" },
  { value: "totalCents_asc", label: "Total low → high" },
  { value: "number_desc", label: "Order # desc" },
  { value: "shippedAt_desc", label: "Recently shipped" },
];

export const statusOptions = ORDER_STATUSES.map((s) => ({ value: s, label: s.replace("_", " ") }));
