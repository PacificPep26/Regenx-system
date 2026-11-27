"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireStoreById } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { UserError } from "@/lib/orders";
import { requestTopUp, fulfillTopUp, dismissTopUp } from "@/lib/topups";

export type TopUpState = { error?: string; ok?: string } | undefined;

async function run(fn: () => Promise<unknown>, ok: string): Promise<TopUpState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: e.issues[0].message };
    throw e;
  }
  revalidatePath("/", "layout");
  return { ok };
}

const cents = (s: string) => {
  try {
    return toCents(s);
  } catch {
    throw new UserError("Invalid amount");
  }
};

export async function requestStoreTopUp(storeId: string, amount: string, note: string): Promise<TopUpState> {
  const { user } = await requireStoreById(storeId);
  return run(() => requestTopUp(storeId, user, cents(amount), note), "Top-up requested. The admin has been notified.");
}

export async function fulfillStoreTopUp(id: string, amount: string, method: string, reference: string): Promise<TopUpState> {
  const u = await requireRole("ADMIN");
  return run(() => fulfillTopUp(id, u, { amountCents: cents(amount), method: method.trim().slice(0, 40) || "WIRE", reference: reference.trim().slice(0, 80) }), "Payment recorded.");
}

export async function dismissStoreTopUp(id: string): Promise<TopUpState> {
  const u = await requireRole("ADMIN");
  return run(() => dismissTopUp(id, u), "Dismissed.");
}
