"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStoreById } from "@/lib/auth";
import { customerSchema } from "@/lib/schemas";
import { createOrder } from "./orders";

export type ImportRow = Record<string, string>;
export type ImportResult = { rowErrors?: { row: number; message: string }[]; results?: { ref: string; number?: number; id?: string; error?: string }[]; error?: string };

/** All rows are validated first; nothing is created if any row is invalid. */
export async function importOrders(storeId: string, rows: ImportRow[], submit: boolean): Promise<ImportResult> {
  const { store } = await requireStoreById(storeId);
  if (!Array.isArray(rows) || rows.length === 0) return { error: "File has no rows." };
  if (rows.length > 2000) return { error: "Max 2000 rows per import." };

  const products = await db.product.findMany({
    where: { active: true, ...(store.allowRestricted ? {} : { restricted: false }) },
    select: { id: true, sku: true },
  });
  const skuId = new Map(products.map((p) => [p.sku.toUpperCase(), p.id]));

  const rowErrors: { row: number; message: string }[] = [];
  const groups = new Map<string, { customer: z.output<typeof customerSchema>; items: Map<string, number> }>();

  rows.forEach((r, i) => {
    const row = i + 2; // header is line 1
    const g = (k: string) => (r[k] ?? "").trim();
    const c = customerSchema.safeParse({
      name: g("name"),
      email: g("email"),
      phone: g("phone"),
      company: g("company"),
      line1: g("address1"),
      line2: g("address2"),
      city: g("city"),
      region: g("state"),
      postalCode: g("zip"),
      country: g("country") || "US",
    });
    if (!c.success) return rowErrors.push({ row, message: c.error.issues.map((x) => `${String(x.path[0])}: ${x.message}`).join("; ") });
    const pid = skuId.get(g("sku").toUpperCase());
    if (!pid) return rowErrors.push({ row, message: `Unknown or unavailable SKU "${g("sku")}"` });
    const qty = Number(g("qty"));
    if (!Number.isInteger(qty) || qty < 1 || qty > 1_000_000) return rowErrors.push({ row, message: `Invalid qty "${g("qty")}"` });
    const ref = g("order_ref") || `row-${row}`;
    const grp = groups.get(ref) ?? { customer: c.data, items: new Map() };
    if (grp.customer.email !== c.data.email) return rowErrors.push({ row, message: `order_ref ${ref} has different customer emails` });
    grp.items.set(pid, (grp.items.get(pid) ?? 0) + qty);
    groups.set(ref, grp);
  });
  if (rowErrors.length) return { rowErrors };

  const results: ImportResult["results"] = [];
  for (const [ref, grp] of groups) {
    const r = await createOrder({
      storeId,
      externalRef: ref.startsWith("row-") ? undefined : ref,
      customer: { ...grp.customer, tags: grp.customer.tags.join(",") },
      items: [...grp.items].map(([productId, qty]) => ({ productId, qty })),
      submit,
    });
    const o = r.id ? await db.order.findUnique({ where: { id: r.id }, select: { number: true } }) : null;
    results.push({ ref, id: r.id, number: o?.number, error: r.error });
  }
  revalidatePath(`/s/${store.slug}`, "layout");
  return { results };
}
