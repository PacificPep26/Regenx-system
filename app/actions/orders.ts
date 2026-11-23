"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStoreById, requireUser } from "@/lib/auth";
import { orderSchema, customerSchema, type OrderInput } from "@/lib/schemas";
import { submitOrder as submitTx, cancelOrder as cancelTx, approveHold as approveTx, UserError } from "@/lib/orders";
import { audit } from "@/lib/audit";
import { createDraftOrder } from "@/lib/orderCreate";

export type ActionResult = { error?: string; ok?: string; id?: string };

const FIELD_LABEL: Record<string, string> = {
  name: "Name", email: "Email", phone: "Phone", line1: "Address", city: "City", region: "State", postalCode: "ZIP", country: "Country", items: "Products", qty: "Quantity",
};

function fail(e: unknown): ActionResult {
  if (e instanceof UserError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: e.issues.map((i) => `${FIELD_LABEL[String(i.path[i.path.length - 1])] ?? ""}${FIELD_LABEL[String(i.path[i.path.length - 1])] ? ": " : ""}${i.message}`).join("; ") };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}

/** Creates the order as DRAFT (and the customer if new), optionally submits it right away. */
export async function createOrder(input: OrderInput): Promise<ActionResult> {
  try {
    const data = orderSchema.parse(input);
    const { user, store } = await requireStoreById(data.storeId);
    const orderId = await createDraftOrder(store.id, user.id, data);

    if (data.submit) {
      try {
        await submitTx(orderId, user);
      } catch (e) {
        revalidatePath(`/s/${store.slug}`, "layout");
        return { ...fail(e), id: orderId }; // draft stays so the partner can fix and resubmit
      }
    }
    revalidatePath(`/s/${store.slug}`, "layout");
    return { ok: "Order saved.", id: orderId };
  } catch (e) {
    return fail(e);
  }
}

async function loadOrderForUser(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { store: true } });
  const { user } = await requireStoreById(o.storeId);
  return { o, user };
}

export async function submitOrder(orderId: string): Promise<ActionResult> {
  try {
    const { o, user } = await loadOrderForUser(orderId);
    const status = await submitTx(orderId, user);
    revalidatePath(`/s/${o.store.slug}`, "layout");
    return { ok: status === "ON_HOLD" ? "Submitted · on hold (over credit), awaiting approval." : "Submitted and approved." };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelOrder(orderId: string, reason?: string): Promise<ActionResult> {
  try {
    const { o, user } = await loadOrderForUser(orderId);
    if (user.role === "PARTNER_STAFF" && o.status !== "DRAFT") return { error: "Only the store owner can cancel submitted orders." };
    await cancelTx(orderId, user, reason?.slice(0, 500));
    revalidatePath(`/s/${o.store.slug}`, "layout");
    revalidatePath("/fulfillment");
    return { ok: "Order cancelled." };
  } catch (e) {
    return fail(e);
  }
}

export async function approveHold(orderId: string): Promise<ActionResult> {
  try {
    const u = await requireUser();
    if (u.role !== "ADMIN") return { error: "Admins only." };
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { store: true } });
    await approveTx(orderId, u);
    revalidatePath(`/s/${o.store.slug}`, "layout");
    revalidatePath("/overview");
    return { ok: "Approved." };
  } catch (e) {
    return fail(e);
  }
}

/** Edit a draft's lines / ship-to. */
export async function updateDraft(
  orderId: string,
  input: { items: { productId: string; qty: number }[]; ship: z.input<typeof customerSchema>; externalRef?: string; notes?: string },
): Promise<ActionResult> {
  try {
    const { o, user } = await loadOrderForUser(orderId);
    if (o.status !== "DRAFT") return { error: "Only drafts can be edited." };
    const items = orderSchema.shape.items.parse(input.items);
    const ship = customerSchema.parse(input.ship);
    const products = await db.product.findMany({ where: { id: { in: items.map((i) => i.productId) }, active: true } });
    if (products.length !== new Set(items.map((i) => i.productId)).size || products.length !== items.length) return { error: "Invalid product list." };
    const price = new Map(products.map((p) => [p.id, p.basePriceCents]));
    await db.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId } });
      await tx.order.update({
        where: { id: orderId },
        data: {
          externalRef: input.externalRef?.trim() || null,
          notes: input.notes?.trim() || null,
          shipName: ship.name,
          shipLine1: ship.line1,
          shipLine2: ship.line2 ?? null,
          shipCity: ship.city,
          shipRegion: ship.region,
          shipPostalCode: ship.postalCode,
          shipCountry: ship.country,
          items: { create: items.map((i) => ({ productId: i.productId, qty: i.qty, unitPriceCents: price.get(i.productId)! })) },
        },
      });
      await audit(tx, user.id, "order.edit_draft", "Order", orderId);
    });
    revalidatePath(`/s/${o.store.slug}`, "layout");
    return { ok: "Draft updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDraft(orderId: string): Promise<ActionResult> {
  try {
    const { o } = await loadOrderForUser(orderId);
    if (o.status !== "DRAFT") return { error: "Only drafts can be deleted." };
    await db.$transaction([db.message.updateMany({ where: { orderId }, data: { orderId: null } }), db.order.delete({ where: { id: orderId } })]);
    revalidatePath(`/s/${o.store.slug}`, "layout");
    return { ok: "Draft deleted." };
  } catch (e) {
    return fail(e);
  }
}
