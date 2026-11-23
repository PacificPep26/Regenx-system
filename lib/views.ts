import { db } from "./db";

export async function viewsFor(userId: string, database: string, storeId?: string | null) {
  const rows = await db.savedView.findMany({ where: { userId, database, storeId: storeId ?? null }, orderBy: { name: "asc" } });
  return rows.map((r) => ({ id: r.id, name: r.name, query: (r.config as { query: string }).query }));
}
