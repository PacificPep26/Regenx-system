"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { UserError } from "@/lib/orders";
import { requestPayout, resolvePayout } from "@/lib/gpEarnings";

export type PayoutState = { error?: string; ok?: string } | undefined;

async function run(fn: () => Promise<unknown>, ok: string): Promise<PayoutState> {
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

export async function requestGpPayout(amount: string, from?: string, to?: string): Promise<PayoutState> {
  const u = await requireRole("FULFILLMENT");
  return run(async () => {
    let cents: number;
    try {
      cents = toCents(amount);
    } catch {
      throw new UserError("Invalid amount");
    }
    await requestPayout(u, cents, from && to ? { from, to } : undefined);
  }, "Payout requested. The admin has been notified.");
}

export async function resolveGpPayout(id: string, status: "PAID" | "REJECTED", method: string, reference: string, note: string): Promise<PayoutState> {
  const u = await requireRole("ADMIN");
  return run(
    () => resolvePayout(id, u, { status, method: method.trim().slice(0, 40), reference: reference.trim().slice(0, 80), note: note.slice(0, 300) }),
    status === "PAID" ? "Marked as paid." : "Request rejected.",
  );
}
