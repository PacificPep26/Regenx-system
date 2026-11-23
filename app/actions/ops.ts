"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { startPacking, markShipped, markDelivered, recordPayment, adjust, UserError } from "@/lib/orders";
import { audit } from "@/lib/audit";
import { runWeeklyStatements } from "@/lib/statements";

export type OpsState = { error?: string; ok?: string } | undefined;

const money = z.string().transform((s, ctx) => {
  try {
    return toCents(s);
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid amount" });
    return z.NEVER;
  }
});

async function run(fn: () => Promise<unknown>, ok: string, paths: string[] = []): Promise<OpsState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: e.issues[0].message };
    throw e;
  }
  revalidatePath("/", "layout");
  for (const p of paths) revalidatePath(p);
  return { ok };
}

/* ---------- Fulfillment (GP) ---------- */

export async function packOrder(orderId: string) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  return run(() => startPacking(orderId, u), "Marked packing.");
}

export async function shipOrder(_: OpsState, form: FormData) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  return run(async () => {
    const p = z
      .object({ orderId: z.string(), carrier: z.string().trim().min(2).max(40), trackingNo: z.string().trim().min(4).max(60), fee: money })
      .parse(Object.fromEntries(form));
    await markShipped(p.orderId, u, { carrier: p.carrier, trackingNo: p.trackingNo, shippingFeeCents: p.fee });
  }, "Marked shipped.");
}

export async function deliverOrder(orderId: string) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  return run(() => markDelivered(orderId, u), "Marked delivered.");
}

/* ---------- Admin: money ---------- */

export async function addPayment(_: OpsState, form: FormData) {
  const u = await requireRole("ADMIN");
  return run(async () => {
    const p = z
      .object({ storeId: z.string(), amount: money, method: z.enum(["WIRE", "ACH", "CHECK", "CARD", "OTHER"]), reference: z.string().trim().max(80).optional() })
      .parse(Object.fromEntries(form));
    if (p.amount <= 0) throw new UserError("Amount must be positive.");
    await recordPayment(p.storeId, u, { amountCents: p.amount, method: p.method, reference: p.reference || undefined });
  }, "Payment recorded.");
}

export async function addAdjustment(_: OpsState, form: FormData) {
  const u = await requireRole("ADMIN");
  return run(async () => {
    const p = z
      .object({ storeId: z.string(), bucket: z.enum(["CREDIT", "OUTSTANDING", "SHIPPING"]), amount: money, memo: z.string().trim().min(3, "Memo required").max(200) })
      .parse(Object.fromEntries(form));
    if (p.amount === 0) throw new UserError("Amount cannot be zero.");
    await adjust(p.storeId, u, { bucket: p.bucket, amountCents: p.amount, memo: p.memo, type: "ADJUSTMENT" });
  }, "Adjustment posted.");
}

export async function runStatementsNow() {
  await requireRole("ADMIN");
  const r = await runWeeklyStatements();
  revalidatePath("/", "layout");
  return { ok: `Created ${r.created} statement(s); ${r.markedOverdue} marked overdue.` };
}

/* ---------- Admin: stores & users ---------- */

const TIERS = { STARTER: { requiredBalanceCents: 1_000_000, discountBps: 500 }, PREMIUM: { requiredBalanceCents: 5_000_000, discountBps: 1000 } };

const regions = z
  .string()
  .transform((s) => s.split(/[\s,]+/).map((r) => r.trim().toUpperCase()).filter(Boolean))
  .pipe(z.array(z.string().regex(/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/, "Regions look like US or US-CA")));

export type CreateStoreState = { error?: string; created?: { slug: string; name: string; email: string; password: string } } | undefined;

/** Creates the store AND its owner login in one go; returns the credentials once so admin can hand them over. */
export async function createStore(_: CreateStoreState, form: FormData): Promise<CreateStoreState> {
  const u = await requireRole("ADMIN");
  const p = z
    .object({
      name: z.string().trim().min(2, "Store name is required").max(80),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Slug: lowercase letters, digits, dashes"),
      tier: z.enum(["STARTER", "PREMIUM"]),
      regions,
      depositReceived: z.string().optional(),
      ownerName: z.string().trim().min(2, "Owner name is required").max(80),
      ownerEmail: z.string().trim().toLowerCase().email("Owner email is invalid"),
      ownerPassword: z
        .string()
        .optional()
        .transform((v) => v?.trim() || undefined)
        .pipe(z.string().min(10, "Password must be at least 10 characters").optional()),
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  const password = d.ownerPassword ?? tempPassword();
  try {
    await db.$transaction(async (tx) => {
      const s = await tx.store.create({
        data: { name: d.name, slug: d.slug, tier: d.tier, ...TIERS[d.tier], allowedRegions: d.regions, status: d.depositReceived ? "ACTIVE" : "PENDING" },
      });
      if (d.depositReceived)
        await tx.ledgerEntry.create({ data: { storeId: s.id, bucket: "CREDIT", type: "DEPOSIT", amountCents: s.requiredBalanceCents, memo: "Initial deposit", createdById: u.id } });
      const owner = await tx.user.create({
        data: { email: d.ownerEmail, name: d.ownerName, role: "PARTNER_OWNER", storeId: s.id, passwordHash: await bcrypt.hash(password, 10) },
      });
      await audit(tx, u.id, "store.create", "Store", s.id, { name: d.name, slug: d.slug, tier: d.tier, ownerId: owner.id });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = String(e.meta?.target ?? "");
      return { error: target.includes("email") ? "That owner email is already registered." : "Slug already in use." };
    }
    throw e;
  }
  revalidatePath("/", "layout");
  return { created: { slug: d.slug, name: d.name, email: d.ownerEmail, password } };
}

const tempPassword = () => randomBytes(9).toString("base64url");

/** Admin sets a new temporary password; all of that user's sessions are signed out. */
export async function resetPassword(userId: string): Promise<{ error?: string; password?: string; email?: string }> {
  const u = await requireRole("ADMIN");
  const password = tempPassword();
  const target = await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 10), sessionVersion: { increment: 1 } },
  });
  await audit(db, u.id, "user.reset_password", "User", userId);
  return { password, email: target.email };
}

export async function updateStore(_: OpsState, form: FormData): Promise<OpsState> {
  const u = await requireRole("ADMIN");
  const p = z
    .object({
      storeId: z.string(),
      name: z.string().trim().min(2).max(80),
      tier: z.enum(["STARTER", "PREMIUM"]),
      status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]),
      regions,
      allowRestricted: z.string().optional(),
      hideAmountsFromStaff: z.string().optional(),
      brandingLogoUrl: z.string().trim().url().or(z.literal("")).optional(),
      labelNotes: z.string().trim().max(2000).optional(),
      insuranceStatus: z.enum(["NONE", "REQUESTED", "ACTIVE"]).default("NONE"),
      insuranceNote: z.string().trim().max(300).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  await db.$transaction(async (tx) => {
    await tx.store.update({
      where: { id: d.storeId },
      data: {
        name: d.name,
        tier: d.tier,
        ...TIERS[d.tier],
        status: d.status,
        allowedRegions: d.regions,
        allowRestricted: d.allowRestricted === "on",
        hideAmountsFromStaff: d.hideAmountsFromStaff === "on",
        brandingLogoUrl: d.brandingLogoUrl || null,
        labelNotes: d.labelNotes || null,
        insuranceStatus: d.tier === "PREMIUM" ? d.insuranceStatus : "NONE",
        insuranceNote: d.insuranceNote || null,
      },
    });
    await audit(tx, u.id, "store.update", "Store", d.storeId, d);
  });
  revalidatePath("/", "layout");
  return { ok: "Store saved." };
}

/** Creates a user and returns a one-time temporary password to hand over securely. */
export async function inviteUser(_: OpsState, form: FormData): Promise<OpsState> {
  const u = await requireRole("ADMIN");
  const p = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      name: z.string().trim().min(2).max(80),
      role: z.enum(["ADMIN", "FULFILLMENT", "PARTNER_OWNER", "PARTNER_STAFF"]),
      storeId: z.string().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const partner = p.data.role.startsWith("PARTNER");
  if (partner && !p.data.storeId) return { error: "Partner users need a store." };
  const temp = tempPassword();
  try {
    const created = await db.user.create({
      data: { email: p.data.email, name: p.data.name, role: p.data.role, storeId: partner ? p.data.storeId : null, passwordHash: await bcrypt.hash(temp, 10) },
    });
    await audit(db, u.id, "user.invite", "User", created.id, { email: p.data.email, role: p.data.role });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Email already registered." };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok: `User created. Temporary password: ${temp} (shown once; ask them to change it)` };
}

export async function setUserActive(userId: string, active: boolean) {
  const u = await requireRole("ADMIN");
  if (userId === u.id) return { error: "You cannot deactivate yourself." };
  await db.user.update({ where: { id: userId }, data: { active, sessionVersion: { increment: 1 } } });
  await audit(db, u.id, active ? "user.activate" : "user.deactivate", "User", userId);
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

/* ---------- Admin: catalog ---------- */

const productFields = {
  name: z.string().trim().min(2, "Name is required").max(100),
  strength: z.string().trim().min(1, "Strength is required").max(30),
  sourceCode: z.string().trim().max(40).optional().transform((v) => v || null),
  upc: z.string().trim().regex(/^\d{8,14}$/, "UPC must be 8 to 14 digits").or(z.literal("")).optional().transform((v) => v || null),
  price: money,
  active: z.string().optional(),
  restricted: z.string().optional(),
  notes: z.string().max(500).optional().transform((v) => v?.trim() || null),
};

const slugPart = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function updateProduct(_: OpsState, form: FormData): Promise<OpsState> {
  const u = await requireRole("ADMIN");
  return run(async () => {
    const p = z.object({ id: z.string(), ...productFields }).parse(Object.fromEntries(form));
    if (p.price <= 0) throw new UserError("Price must be positive.");
    const before = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    // SKU stays stable (orders and exports reference it); only the display fields change
    const data = {
      name: p.name,
      strength: p.strength,
      sourceCode: p.sourceCode,
      upc: p.upc,
      basePriceCents: p.price,
      active: p.active === "on",
      restricted: p.restricted === "on",
      notes: p.notes,
    };
    await db.$transaction([
      db.product.update({ where: { id: p.id }, data }),
      db.auditLog.create({
        data: {
          actorId: u.id,
          action: "product.update",
          entity: "Product",
          entityId: p.id,
          data: { before: { name: before.name, strength: before.strength, basePriceCents: before.basePriceCents, active: before.active, restricted: before.restricted }, after: data },
        },
      }),
    ]);
  }, "Saved.");
}

export async function createProduct(_: OpsState, form: FormData): Promise<OpsState> {
  const u = await requireRole("ADMIN");
  return run(async () => {
    const p = z.object(productFields).parse(Object.fromEntries(form));
    if (p.price <= 0) throw new UserError("Price must be positive.");
    const base = `${slugPart(p.name)}-${slugPart(p.strength)}`;
    let sku = base;
    for (let n = 2; await db.product.findUnique({ where: { sku } }); n++) sku = `${base}-${String.fromCharCode(63 + n)}`; // -B, -C...
    const created = await db.product.create({
      data: { sku, name: p.name, strength: p.strength, sourceCode: p.sourceCode, upc: p.upc, basePriceCents: p.price, active: p.active === "on", restricted: p.restricted === "on", notes: p.notes },
    });
    await audit(db, u.id, "product.create", "Product", created.id, { sku, price: p.price });
  }, "Product added.", ["/catalog"]);
}

export async function addProductDoc(_: OpsState, form: FormData): Promise<OpsState> {
  const u = await requireRole("ADMIN");
  return run(async () => {
    const d = z.object({ productId: z.string(), title: z.string().trim().min(2, "Title is required").max(100), url: z.string().trim().url("Enter a full link (https://…)").max(500) }).parse(Object.fromEntries(form));
    if (!/^https:\/\//i.test(d.url)) throw new UserError("Links must use https.");
    await db.productDoc.create({ data: d });
    await audit(db, u.id, "product.doc_add", "Product", d.productId, { title: d.title });
  }, "Document added.", ["/catalog"]);
}

export async function deleteProductDoc(id: string) {
  const u = await requireRole("ADMIN");
  const d = await db.productDoc.delete({ where: { id } });
  await audit(db, u.id, "product.doc_delete", "Product", d.productId, { title: d.title });
  revalidatePath("/catalog");
}
