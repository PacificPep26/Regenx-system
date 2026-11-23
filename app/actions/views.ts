"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requireStoreById } from "@/lib/auth";

export async function saveView(input: { database: string; storeId: string | null; name: string; query: string }) {
  const u = await requireUser();
  const p = z
    .object({ database: z.string().max(40), storeId: z.string().nullable(), name: z.string().min(1).max(60), query: z.string().max(2000) })
    .parse(input);
  if (p.storeId) await requireStoreById(p.storeId, { ops: true });
  await db.savedView.create({ data: { userId: u.id, database: p.database, storeId: p.storeId, name: p.name, config: { query: p.query } } });
  revalidatePath("/", "layout");
}

export async function deleteView(id: string) {
  const u = await requireUser();
  await db.savedView.deleteMany({ where: { id, userId: u.id } });
  revalidatePath("/", "layout");
}
