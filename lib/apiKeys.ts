import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";

const hash = (k: string) => createHash("sha256").update(k).digest("hex");

/** Premium partners get order/tracking integration (program: "Order and tracking integration"). */
export const apiAllowed = (store: { tier: string; status: string }) => store.tier === "PREMIUM" && store.status === "ACTIVE";

/** Returns the plaintext key ONCE; only its SHA-256 is stored. */
export async function createApiKey(storeId: string, name: string) {
  const key = "rxk_" + randomBytes(24).toString("base64url");
  const row = await db.apiKey.create({ data: { storeId, name: name.trim().slice(0, 60) || "Integration", prefix: key.slice(0, 10), keyHash: hash(key) } });
  return { key, id: row.id, prefix: row.prefix };
}

export const revokeApiKey = (id: string, storeId: string) => db.apiKey.updateMany({ where: { id, storeId, revokedAt: null }, data: { revokedAt: new Date() } });

// shortcut: per-instance sliding window; use Redis when running several instances
const hits = new Map<string, number[]>();
const LIMIT = 60; // requests per minute per key

export type ApiAuth = { ok: true; store: { id: string; slug: string; tier: string; status: string; name: string }; actorId: string } | { ok: false; status: number; error: string };

export async function authenticateApi(req: Request): Promise<ApiAuth> {
  const m = /^Bearer (rxk_[A-Za-z0-9_-]{20,})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return { ok: false, status: 401, error: "Missing or malformed API key. Send 'Authorization: Bearer rxk_…'." };
  const row = await db.apiKey.findUnique({ where: { keyHash: hash(m[1]) }, include: { store: true } });
  if (!row || row.revokedAt) return { ok: false, status: 401, error: "Invalid or revoked API key." };
  if (!apiAllowed(row.store)) return { ok: false, status: 403, error: "The order API is available to active Premium partners." };

  const now = Date.now();
  const recent = (hits.get(row.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMIT) return { ok: false, status: 429, error: `Rate limit exceeded (${LIMIT}/min).` };
  hits.set(row.id, [...recent, now]);
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > 60_000) await db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } });
  return { ok: true, store: row.store, actorId: `api:${row.prefix}` };
}

type FullOrder = {
  id: string; number: number; externalRef: string | null; status: string; totalCents: number; discountBps: number; creditAppliedCents: number; overageCents: number;
  carrier: string | null; trackingNo: string | null; shippingFeeCents: number | null; createdAt: Date; submittedAt: Date | null; shippedAt: Date | null; deliveredAt: Date | null;
  shipName: string; shipLine1: string; shipLine2: string | null; shipCity: string; shipRegion: string; shipPostalCode: string; shipCountry: string;
  items: { qty: number; unitPriceCents: number; product: { sku: string; name: string; strength: string } }[];
};

/** Stable public shape of an order for integrators (money in integer cents, USD). */
export const serializeOrder = (o: FullOrder) => ({
  id: o.id,
  number: o.number,
  externalRef: o.externalRef,
  status: o.status,
  currency: "USD",
  wholesaleTotalCents: o.totalCents,
  goodsCostCents: o.totalCents, // same as wholesaleTotalCents; shipping is separate and not taken from credit
  discountBps: o.discountBps,
  creditAppliedCents: o.creditAppliedCents,
  overageCents: o.overageCents,
  shippingFeeCents: o.shippingFeeCents,
  shippingCostCents: o.shippingFeeCents,
  createdAt: o.createdAt,
  submittedAt: o.submittedAt,
  shippedAt: o.shippedAt,
  deliveredAt: o.deliveredAt,
  tracking: o.trackingNo ? { carrier: o.carrier, trackingNo: o.trackingNo } : null,
  shipTo: { name: o.shipName, line1: o.shipLine1, line2: o.shipLine2, city: o.shipCity, region: o.shipRegion, postalCode: o.shipPostalCode, country: o.shipCountry },
  items: o.items.map((i) => ({ sku: i.product.sku, name: i.product.name, strength: i.product.strength, qty: i.qty, unitPriceCents: i.unitPriceCents })),
});

export const ORDER_INCLUDE = { items: { include: { product: { select: { sku: true, name: true, strength: true } } } } } as const;
