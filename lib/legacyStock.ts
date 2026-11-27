import "server-only";
import { db } from "./db";

/**
 * The old warehouse-wide stock list (Product.onHand, the "GP stock" pages) only matters for stores that are not in
 * inventory mode. Once every store is on inventory mode, GP's warehouse is simply the sum of the stores' own stock
 * (the Inventory page), so the old pages are hidden and redirect there.
 */
export const hasLegacyStores = async () => (await db.store.count({ where: { inventoryMode: false } })) > 0;
