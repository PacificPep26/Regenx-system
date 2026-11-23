"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStoreById } from "@/lib/auth";
import { apiAllowed, createApiKey, revokeApiKey } from "@/lib/apiKeys";
import { notify } from "@/lib/notify";
import { audit } from "@/lib/audit";

export type PlanState = { error?: string; ok?: string; key?: string } | undefined;

/** Owners (and admin) manage integration keys; staff cannot. */
async function owner(storeId: string) {
  const { user, store } = await requireStoreById(storeId);
  if (user.role === "PARTNER_STAFF") throw new Error("Only the store owner can manage this.");
  return { user, store };
}

export async function makeKey(_: PlanState, form: FormData): Promise<PlanState> {
  const p = z.object({ storeId: z.string(), name: z.string().trim().max(60).optional() }).parse(Object.fromEntries(form));
  const { user, store } = await owner(p.storeId);
  if (!apiAllowed(store)) return { error: "The order API is available to active Premium partners." };
  if ((await db.apiKey.count({ where: { storeId: store.id, revokedAt: null } })) >= 5) return { error: "Maximum 5 active keys. Revoke one first." };
  const k = await createApiKey(store.id, p.name || "Integration");
  await audit(db, user.id, "apikey.create", "Store", store.id, { prefix: k.prefix });
  revalidatePath(`/s/${store.slug}/plan`);
  return { ok: "Key created. Copy it now: it is shown only once.", key: k.key };
}

export async function removeKey(storeId: string, keyId: string) {
  const { user, store } = await owner(storeId);
  await revokeApiKey(keyId, store.id);
  await audit(db, user.id, "apikey.revoke", "Store", store.id, { keyId });
  revalidatePath(`/s/${store.slug}/plan`);
}

export async function requestInsurance(storeId: string): Promise<PlanState> {
  const { user, store } = await owner(storeId);
  if (store.tier !== "PREMIUM") return { error: "Insurance eligibility is part of the Premium plan." };
  if (store.insuranceStatus !== "NONE") return { error: "Insurance is already requested or active." };
  await db.$transaction(async (tx) => {
    await tx.store.update({ where: { id: store.id }, data: { insuranceStatus: "REQUESTED" } });
    await notify(tx, { audience: "ADMIN", storeId: store.id, title: `${store.name} requested insurance coverage`, link: `/s/${store.slug}/settings` });
    await audit(tx, user.id, "insurance.request", "Store", store.id);
  });
  revalidatePath(`/s/${store.slug}/plan`);
  return { ok: "Request sent. RegenX will confirm once the insurer approves." };
}
