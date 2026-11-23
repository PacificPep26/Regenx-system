import type { Prisma } from "@prisma/client";
import { str, dateRange, type SP } from "./query";

/** Shared by the cross-store customer page and its CSV export. */
export function customerWhere(sp: SP, base: Prisma.CustomerWhereInput = {}): Prisma.CustomerWhereInput {
  const and: Prisma.CustomerWhereInput[] = [base];
  const q = str(sp, "q");
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [{ name: c }, { email: c }, { phone: c }, { company: c }, { city: c }, { line1: c }, { postalCode: c }, { notes: c }, { tags: { has: q.toLowerCase() } }, { store: { name: c } }],
    });
  }
  const store = str(sp, "store");
  if (store) and.push({ store: { slug: store } });
  const region = str(sp, "region");
  if (region) and.push({ region: region.toUpperCase() });
  const country = str(sp, "country");
  if (country) and.push({ country: country.toUpperCase() });
  const tag = str(sp, "tag");
  if (tag) and.push({ tags: { has: tag } });
  const has = str(sp, "orders");
  if (has === "yes") and.push({ orders: { some: { status: { notIn: ["DRAFT", "CANCELLED"] } } } });
  if (has === "no") and.push({ orders: { none: { status: { notIn: ["DRAFT", "CANCELLED"] } } } });
  const created = dateRange(sp, "from", "to");
  if (created) and.push({ createdAt: created });
  return { AND: and };
}
