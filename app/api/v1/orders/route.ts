import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateApi, serializeOrder, ORDER_INCLUDE } from "@/lib/apiKeys";
import { customerSchema } from "@/lib/schemas";
import { createDraftOrder } from "@/lib/orderCreate";
import { submitOrder, UserError } from "@/lib/orders";

export const dynamic = "force-dynamic";

const body = z.object({
  externalRef: z.string().trim().min(1).max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
  submit: z.boolean().default(true),
  customer: customerSchema,
  items: z.array(z.object({ sku: z.string().trim().min(1), qty: z.number().int().min(1).max(1_000_000) })).min(1).max(200),
});

const err = (status: number, error: string, extra: object = {}) => NextResponse.json({ error, ...extra }, { status });

/** POST /api/v1/orders: create (and by default submit) an order for the key's store. Premium partners only. */
export async function POST(req: Request) {
  const a = await authenticateApi(req);
  if (!a.ok) return err(a.status, a.error);
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return err(400, "Body must be JSON.");
  }
  const p = body.safeParse(json);
  if (!p.success) return err(422, "Invalid order.", { issues: p.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  const d = p.data;

  // idempotency: one order per externalRef, so a retried webhook never double-orders
  if (d.externalRef) {
    const dup = await db.order.findFirst({ where: { storeId: a.store.id, externalRef: d.externalRef }, include: ORDER_INCLUDE });
    if (dup) return err(409, "An order with this externalRef already exists.", { order: serializeOrder(dup) });
  }

  const skus = [...new Set(d.items.map((i) => i.sku))];
  const products = await db.product.findMany({ where: { sku: { in: skus }, active: true }, select: { id: true, sku: true } });
  const missing = skus.filter((s) => !products.some((p) => p.sku === s));
  if (missing.length) return err(422, "Unknown or unavailable SKU.", { skus: missing });
  const bySku = new Map(products.map((x) => [x.sku, x.id]));
  const qty = new Map<string, number>();
  for (const i of d.items) qty.set(bySku.get(i.sku)!, (qty.get(bySku.get(i.sku)!) ?? 0) + i.qty); // merge repeated SKUs

  try {
    const id = await createDraftOrder(a.store.id, a.actorId, {
      customer: d.customer as never,
      externalRef: d.externalRef,
      notes: d.notes,
      items: [...qty].map(([productId, q]) => ({ productId, qty: q })),
    });
    let submitError: string | undefined;
    if (d.submit) {
      try {
        await submitOrder(id, { id: a.actorId, role: "API" });
      } catch (e) {
        if (!(e instanceof UserError)) throw e;
        submitError = e.message; // the draft is kept so the partner can fix the cause and submit from the portal
      }
    }
    const o = await db.order.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
    return NextResponse.json({ order: serializeOrder(o), ...(submitError ? { warning: `Saved as draft, not submitted: ${submitError}` } : {}) }, { status: submitError ? 202 : 201 });
  } catch (e) {
    if (e instanceof UserError) return err(422, e.message);
    console.error("api order failed", e);
    return err(500, "Could not create the order.");
  }
}

/** GET /api/v1/orders?externalRef=&status=&limit= : look orders up (tracking included). */
export async function GET(req: Request) {
  const a = await authenticateApi(req);
  if (!a.ok) return err(a.status, a.error);
  const u = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Number(u.get("limit")) || 25));
  const status = u.get("status");
  const orders = await db.order.findMany({
    where: { storeId: a.store.id, ...(u.get("externalRef") ? { externalRef: u.get("externalRef")! } : {}), ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: ORDER_INCLUDE,
  });
  return NextResponse.json({ orders: orders.map(serializeOrder) });
}
