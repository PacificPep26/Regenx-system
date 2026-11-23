import "server-only";
import { db } from "./db";
import { audit } from "./audit";
import { UserError } from "./orders";
import type { z } from "zod";
import type { orderSchema } from "./schemas";

export type NewOrder = z.output<typeof orderSchema>;

/**
 * Creates a DRAFT order (and the customer when new) for a store. Shared by the web form, CSV import and the Premium API,
 * so every entry point applies the same validation and snapshot rules. Returns the new order id.
 */
export async function createDraftOrder(storeId: string, actorId: string, data: Omit<NewOrder, "storeId" | "submit">) {
  if (!data.customerId && !data.customer) throw new UserError("Choose or enter a customer.");
  if (data.items.length !== new Set(data.items.map((i) => i.productId)).size) throw new UserError("Each product can appear only once.");

  const products = await db.product.findMany({ where: { id: { in: data.items.map((i) => i.productId) }, active: true } });
  if (products.length !== data.items.length) throw new UserError("Some products are unavailable.");
  const price = new Map(products.map((p) => [p.id, p.basePriceCents]));

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
    const customer = data.customerId
      ? await tx.customer.findFirst({ where: { id: data.customerId, storeId } })
      : await tx.customer.upsert({
          where: { storeId_email: { storeId, email: data.customer!.email } },
          create: { ...data.customer!, storeId },
          update: {},
        });
    if (!customer) throw new UserError("Customer not found.");
    const { nextOrderNumber } = await tx.store.update({ where: { id: storeId }, data: { nextOrderNumber: { increment: 1 } } });
    const order = await tx.order.create({
      data: {
        storeId,
        number: nextOrderNumber - 1,
        customerId: customer.id,
        externalRef: data.externalRef,
        notes: data.notes,
        shipName: customer.name,
        shipLine1: customer.line1,
        shipLine2: customer.line2,
        shipCity: customer.city,
        shipRegion: customer.region,
        shipPostalCode: customer.postalCode,
        shipCountry: customer.country,
        items: { create: data.items.map((i) => ({ productId: i.productId, qty: i.qty, unitPriceCents: price.get(i.productId)! })) },
      },
    });
    await audit(tx, actorId, "order.create", "Order", order.id);
    return order.id;
  });
}
