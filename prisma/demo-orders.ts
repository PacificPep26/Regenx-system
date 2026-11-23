// Dev helper: creates a demo customer + 2 submitted orders for a store.
// Run: pnpm tsx --conditions=react-server prisma/demo-orders.ts [slug]
import { db } from "../lib/db";
import { submitOrder } from "../lib/orders";

async function main() {
  const slug = process.argv[2] ?? "alpha";
  const store = await db.store.findUniqueOrThrow({ where: { slug } });
  const owner = await db.user.findFirstOrThrow({ where: { storeId: store.id, role: "PARTNER_OWNER" } });
  const customer = await db.customer.upsert({
    where: { storeId_email: { storeId: store.id, email: "jane.demo@example.com" } },
    create: { storeId: store.id, name: "Jane Demo", email: "jane.demo@example.com", phone: "512-555-0100", line1: "100 Congress Ave", city: "Austin", region: "TX", postalCode: "78701", country: "US", tags: ["demo"] },
    update: {},
  });
  const products = await db.product.findMany({ where: { active: true, restricted: false }, take: 3, orderBy: { name: "asc" } });
  for (const qty of [2, 5]) {
    const s = await db.store.update({ where: { id: store.id }, data: { nextOrderNumber: { increment: 1 } } });
    const o = await db.order.create({
      data: {
        storeId: store.id, number: s.nextOrderNumber - 1, customerId: customer.id, externalRef: `WEB-${s.nextOrderNumber - 1}`,
        shipName: customer.name, shipLine1: customer.line1, shipCity: customer.city, shipRegion: customer.region, shipPostalCode: customer.postalCode, shipCountry: customer.country,
        items: { create: products.map((p) => ({ productId: p.id, qty, unitPriceCents: p.basePriceCents })) },
      },
    });
    console.log(`#${o.number}`, await submitOrder(o.id, owner));
  }
}

main().finally(() => db.$disconnect());
