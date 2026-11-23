import { requireUser, isPartner } from "@/lib/auth";
import { db } from "@/lib/db";
import { health } from "@/lib/balances";
import { Nav, type NavStore } from "@/components/Nav";
import { unreadCounts } from "@/lib/notify";
import { newOrderCounts } from "@/lib/newOrders";

const SIDEBAR_STORES = 8; // admin/GP may manage hundreds of stores: the sidebar shows only the ones needing attention

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [fresh, unread] = await Promise.all([newOrderCounts(user), unreadCounts(user)]);

  let list;
  let total = 0;
  if (isPartner(user)) {
    list = await db.store.findMany({ where: { id: user.storeId ?? "-" } });
    total = list.length;
  } else {
    // stores with new orders / unread chat first, then the rest alphabetically up to the cap
    const score = (id: string) => (fresh.get(id) ?? 0) + (unread.chatByStore[id] ?? 0);
    const hot = [...new Set([...fresh.keys(), ...Object.keys(unread.chatByStore)])].sort((a, b) => score(b) - score(a)).slice(0, SIDEBAR_STORES);
    const [hotStores, rest, count] = await Promise.all([
      hot.length ? db.store.findMany({ where: { id: { in: hot } } }) : Promise.resolve([]),
      SIDEBAR_STORES - hot.length > 0 ? db.store.findMany({ where: { id: { notIn: hot } }, orderBy: { name: "asc" }, take: SIDEBAR_STORES - hot.length }) : Promise.resolve([]),
      db.store.count(),
    ]);
    list = [...hotStores.sort((a, b) => score(b.id) - score(a.id)), ...rest];
    total = count;
  }

  const overdue = new Set(
    (await db.statement.findMany({ where: { status: "OVERDUE", storeId: { in: list.map((s) => s.id) } }, select: { storeId: true }, distinct: ["storeId"] })).map((r) => r.storeId),
  );
  const stores: NavStore[] = list.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    health: s.status === "ACTIVE" ? health({ CREDIT: s.creditCents, OUTSTANDING: s.outstandingCents, SHIPPING: s.shippingCents }, s.requiredBalanceCents, overdue.has(s.id)) : "grey",
    showMoney: user.role !== "FULFILLMENT" && !(user.role === "PARTNER_STAFF" && s.hideAmountsFromStaff),
    newOrders: fresh.get(s.id) ?? 0,
  }));
  return (
    <div className="min-h-dvh md:flex">
      <Nav role={user.role} userName={user.name} stores={stores} totalStores={total} unread={unread} />
      <main className="min-w-0 flex-1 px-4 py-4 md:px-8 md:py-6">{children}</main>
    </div>
  );
}
