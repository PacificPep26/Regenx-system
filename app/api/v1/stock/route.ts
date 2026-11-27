import { NextResponse } from "next/server";
import { authenticateApi } from "@/lib/apiKeys";
import { db } from "@/lib/db";
import { effectiveMinimum } from "@/lib/storeStock";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/stock: Real-time stock levels for the authenticated store.
 * Allows partner e-commerce platforms (WooCommerce, Shopify, custom sites)
 * to synchronize inventory and prevent overselling out-of-stock items.
 */
export async function GET(req: Request) {
  const a = await authenticateApi(req);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });

  const store = await db.store.findUnique({
    where: { id: a.store.id },
    select: { id: true, name: true, slug: true, inventoryMode: true },
  });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  if (store.inventoryMode) {
    const rows = await db.storeStock.findMany({
      where: { storeId: store.id },
      include: { product: { select: { sku: true, name: true, strength: true, active: true } } },
      orderBy: [{ product: { name: "asc" } }, { product: { strength: "asc" } }],
    });

    const items = rows
      .filter((r) => r.product.active)
      .map((r) => {
        const available = Math.max(0, r.onHand - r.reserved);
        const min = effectiveMinimum(r.reorderLevel);
        const status = available === 0 ? "OUT_OF_STOCK" : available <= min ? "LOW_STOCK" : "IN_STOCK";
        return {
          sku: r.product.sku,
          name: r.product.name,
          strength: r.product.strength,
          onHand: r.onHand,
          reserved: r.reserved,
          available,
          reorderLevel: min,
          status,
        };
      });

    return NextResponse.json({
      store: store.name,
      inventoryMode: true,
      items,
    });
  }

  // Non-inventory (legacy/catalog) mode: return general active products
  const products = await db.product.findMany({
    where: { active: true },
    select: { sku: true, name: true, strength: true, trackStock: true, onHand: true, reserved: true, reorderLevel: true },
    orderBy: [{ name: "asc" }, { strength: "asc" }],
  });

  const items = products.map((p) => {
    const available = p.trackStock ? Math.max(0, p.onHand - p.reserved) : 9999;
    const min = p.reorderLevel > 0 ? p.reorderLevel : 5;
    const status = available === 0 ? "OUT_OF_STOCK" : available <= min ? "LOW_STOCK" : "IN_STOCK";
    return {
      sku: p.sku,
      name: p.name,
      strength: p.strength,
      onHand: p.trackStock ? p.onHand : null,
      reserved: p.trackStock ? p.reserved : null,
      available,
      reorderLevel: min,
      status,
    };
  });

  return NextResponse.json({
    store: store.name,
    inventoryMode: false,
    items,
  });
}
