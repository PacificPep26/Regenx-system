"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStoreById, requireUser } from "@/lib/auth";
import { UserError } from "@/lib/orders";
import { adjustStoreStock, setReorderLevel, createInventoryDraft, submitInventoryOrder, cancelInventoryOrder, receiveInventoryOrder } from "@/lib/inventory";

export type InvResult = { error?: string; ok?: string; id?: string };

const input = z.object({
  storeId: z.string(),
  items: z.array(z.object({ productId: z.string(), qty: z.number().int().min(1).max(1_000_000) })).min(1, "Add at least one product."),
  notes: z.string().max(300).optional(),
  submit: z.boolean().optional(),
});

function fail(e: unknown): InvResult {
  if (e instanceof UserError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: e.issues[0].message };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}

const refresh = (slug: string) => {
  revalidatePath(`/s/${slug}`, "layout");
  revalidatePath("/gp");
  revalidatePath("/overview");
};

async function load(id: string) {
  const o = await db.inventoryOrder.findUniqueOrThrow({ where: { id }, include: { store: true } });
  const { user } = await requireStoreById(o.storeId, { ops: true });
  return { o, user };
}

export async function createInventoryOrder(raw: unknown): Promise<InvResult> {
  try {
    const d = input.parse(raw);
    const { user, store } = await requireStoreById(d.storeId);
    if (user.role === "FULFILLMENT") return { error: "Not allowed." };
    const id = await createInventoryDraft(store.id, user.id, { items: d.items, notes: d.notes });
    if (d.submit) {
      try {
        await submitInventoryOrder(id, user);
        refresh(store.slug);
        return { ok: "Submitted. GP will stock it.", id };
      } catch (e) {
        refresh(store.slug);
        return { ...fail(e), id }; // draft stays so it can be fixed and resubmitted
      }
    }
    refresh(store.slug);
    return { ok: "Draft saved.", id };
  } catch (e) {
    return fail(e);
  }
}

export async function submitInventory(id: string): Promise<InvResult> {
  try {
    const { o, user } = await load(id);
    await submitInventoryOrder(id, user);
    refresh(o.store.slug);
    return { ok: "Submitted. GP will stock it." };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelInventory(id: string, reason?: string): Promise<InvResult> {
  try {
    const { o, user } = await load(id);
    if (user.role === "PARTNER_STAFF" && o.status !== "DRAFT") return { error: "Only the store owner can cancel submitted orders." };
    await cancelInventoryOrder(id, user, reason?.slice(0, 500));
    refresh(o.store.slug);
    return { ok: "Cancelled." };
  } catch (e) {
    return fail(e);
  }
}

/** GP (or admin): the goods are in the store's stock. */
export async function stockInventory(id: string): Promise<InvResult> {
  try {
    const u = await requireUser();
    if (u.role !== "ADMIN" && u.role !== "FULFILLMENT") return { error: "Not allowed." };
    const o = await db.inventoryOrder.findUniqueOrThrow({ where: { id }, include: { store: true } });
    await receiveInventoryOrder(id, u);
    refresh(o.store.slug);
    return { ok: "Stocked." };
  } catch (e) {
    return fail(e);
  }
}

/** Admin: switch the store to (or back from) inventory mode. */
export async function setInventoryMode(storeId: string, on: boolean): Promise<InvResult> {
  const u = await requireUser();
  if (u.role !== "ADMIN") return { error: "Admins only." };
  const s = await db.store.update({ where: { id: storeId }, data: { inventoryMode: on } });
  refresh(s.slug);
  return { ok: on ? "Inventory mode on." : "Inventory mode off." };
}

export async function adjustStock(storeId: string, productId: string, delta: number, reason: string): Promise<InvResult> {
  try {
    const u = await requireUser();
    const s = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    await adjustStoreStock(storeId, productId, Math.trunc(Number(delta)), reason, u);
    refresh(s.slug);
    return { ok: "Stock adjusted." };
  } catch (e) {
    return fail(e);
  }
}

export async function setMinimum(storeId: string, productId: string, level: number): Promise<InvResult> {
  try {
    const { user, store } = await requireStoreById(storeId);
    await setReorderLevel(storeId, productId, Math.trunc(Number(level)), user);
    refresh(store.slug);
    return { ok: "Saved." };
  } catch (e) {
    return fail(e);
  }
}
