import { requireStore } from "@/lib/auth";
import { getBalances } from "@/lib/balances";
import { Badge } from "@/components/ui";
import { StoreBalanceStrip } from "@/components/StoreBalanceStrip";
import { Tabs } from "@/components/Tabs";

export default async function StoreLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store, canSeeMoney, isAdmin } = await requireStore(slug);
  const b = await getBalances(store.id);
  const base = `/s/${slug}`;
  const tabs: [string, string][] = [
    [`${base}/dashboard`, "Dashboard"],
    [`${base}/orders`, "Orders"],
    [`${base}/customers`, "Customers"],
    [`${base}/chat`, "Chat"],
    ...(canSeeMoney ? ([[`${base}/reports`, "Reports"], [`${base}/ledger`, "Ledger"], [`${base}/statements`, "Statements"]] as [string, string][]) : []),
    ...(isAdmin ? ([[`${base}/settings`, "Settings"]] as [string, string][]) : []),
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-navy md:text-xl">{store.name}</h1>
        <Badge value={store.tier} />
        {store.status !== "ACTIVE" && <Badge value={store.status} />}
      </div>
      {canSeeMoney && <StoreBalanceStrip credit={b.CREDIT} required={store.requiredBalanceCents} outstanding={b.OUTSTANDING} shipping={b.SHIPPING} />}
      <Tabs tabs={tabs} />
      {children}
    </div>
  );
}
