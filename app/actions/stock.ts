"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { receiveStock, adjustStock, updateStockSettings, StockError } from "@/lib/stock";

export type StockState = { error?: string; ok?: string } | undefined;

const int = z.coerce.number().int("Whole numbers only");

async function run(fn: () => Promise<unknown>, ok: string): Promise<StockState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof StockError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: e.issues[0].message };
    throw e;
  }
  revalidatePath("/stock");
  revalidatePath("/gp");
  return { ok };
}

export async function receive(_: StockState, form: FormData) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  return run(async () => {
    const p = z.object({ productId: z.string(), qty: int, memo: z.string().trim().max(200).optional() }).parse(Object.fromEntries(form));
    await receiveStock(p.productId, p.qty, p.memo || undefined, u.id);
  }, "Stock received.");
}

export async function adjust(_: StockState, form: FormData) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  return run(async () => {
    const p = z.object({ productId: z.string(), delta: int, memo: z.string().trim().max(200) }).parse(Object.fromEntries(form));
    await adjustStock(p.productId, p.delta, p.memo, u.id);
  }, "Adjustment saved.");
}

export async function saveSettings(_: StockState, form: FormData) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  return run(async () => {
    const p = z.object({ productId: z.string(), trackStock: z.string().optional(), reorderLevel: int }).parse(Object.fromEntries(form));
    await updateStockSettings(p.productId, { trackStock: p.trackStock === "on", reorderLevel: p.reorderLevel }, u.id);
  }, "Saved.");
}
