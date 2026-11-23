"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireStoreById } from "@/lib/auth";
import { customerSchema } from "@/lib/schemas";
import { audit } from "@/lib/audit";

export type CustomerFormState = { error?: string; fieldErrors?: Record<string, string>; ok?: string } | undefined;

function parse(form: FormData) {
  const r = customerSchema.safeParse(Object.fromEntries(form));
  if (r.success) return { data: r.data };
  const fieldErrors: Record<string, string> = {};
  for (const i of r.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return { fieldErrors };
}

const dupEmail = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function createCustomer(_: CustomerFormState, form: FormData): Promise<CustomerFormState> {
  const { user, store } = await requireStoreById(String(form.get("storeId")));
  const p = parse(form);
  if (!p.data) return { fieldErrors: p.fieldErrors, error: "Please fix the highlighted fields." };
  let id: string;
  try {
    const c = await db.customer.create({ data: { ...p.data, storeId: store.id } });
    await audit(db, user.id, "customer.create", "Customer", c.id);
    id = c.id;
  } catch (e) {
    if (dupEmail(e)) return { fieldErrors: { email: "A customer with this email already exists in this store." } };
    throw e;
  }
  revalidatePath(`/s/${store.slug}/customers`);
  redirect(`/s/${store.slug}/customers/${id}`);
}

export async function updateCustomer(_: CustomerFormState, form: FormData): Promise<CustomerFormState> {
  const id = String(form.get("id"));
  const existing = await db.customer.findUniqueOrThrow({ where: { id } });
  const { user, store } = await requireStoreById(existing.storeId);
  const p = parse(form);
  if (!p.data) return { fieldErrors: p.fieldErrors, error: "Please fix the highlighted fields." };
  try {
    await db.customer.update({ where: { id }, data: { ...p.data, line2: p.data.line2 ?? null, phone: p.data.phone ?? null, company: p.data.company ?? null, notes: p.data.notes ?? null } });
  } catch (e) {
    if (dupEmail(e)) return { fieldErrors: { email: "Another customer already uses this email." } };
    throw e;
  }
  await audit(db, user.id, "customer.update", "Customer", id);
  revalidatePath(`/s/${store.slug}/customers`);
  return { ok: "Saved." };
}

export async function deleteCustomer(id: string): Promise<{ error?: string }> {
  const c = await db.customer.findUniqueOrThrow({ where: { id }, include: { _count: { select: { orders: true } } } });
  const { user, store } = await requireStoreById(c.storeId);
  if (c._count.orders > 0) return { error: "Customer has orders and cannot be deleted." };
  await db.customer.delete({ where: { id } });
  await audit(db, user.id, "customer.delete", "Customer", id, { email: c.email });
  revalidatePath(`/s/${store.slug}/customers`);
  redirect(`/s/${store.slug}/customers`);
}
