import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { apiAllowed } from "@/lib/apiKeys";
import { Badge, fmtDate } from "@/components/ui";
import { NewKey, RevokeKey, RequestInsurance } from "./PlanActions";

const PERKS = {
  STARTER: ["5% savings against standard partner wholesale pricing", "Access to the approved product catalog", "Approved partner branding and UPC labeling options", "Direct fulfillment infrastructure", "Order and tracking support", "Access to applicable product documentation"],
  PREMIUM: ["10% savings against standard partner wholesale pricing", "Preferred wholesale pricing", "Approved customized branding and UPC labeling", "Priority partner support", "Order and tracking integration (API)", "Access to applicable product documentation", "Eligibility for applicable insurance arrangements, subject to insurer approval and policy terms"],
};
const INSURANCE = { NONE: "Not requested", REQUESTED: "Requested · awaiting insurer approval", ACTIVE: "Active" } as const;

export default async function PlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, store, isAdmin } = await requireStore(slug);
  if (user.role === "FULFILLMENT") notFound();
  const premium = store.tier === "PREMIUM";
  const canManage = user.role !== "PARTNER_STAFF";
  const keys = premium ? await db.apiKey.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } }) : [];
  const base = process.env.APP_URL ?? "https://YOUR-APP-URL";

  return (
    <div className="max-w-3xl space-y-4">
      <section className="panel p-3 md:p-4">
        <div className="flex items-center gap-2"><h2 className="font-semibold text-navy">{premium ? "Premium partner" : "Starter partner"}</h2><Badge value={store.tier} /></div>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
          {PERKS[store.tier].map((x) => <li key={x}>{x}</li>)}
        </ul>
      </section>

      <section className="panel p-3 md:p-4">
        <h2 className="label">Branding &amp; UPC labeling</h2>
        <p className="whitespace-pre-wrap text-sm">{store.labelNotes || <span className="text-gray-500">No labeling instructions on file. RegenX sets these up with you during onboarding.</span>}</p>
        {store.brandingLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.brandingLogoUrl} alt="" className="mt-2 h-12 w-auto" />
        )}
      </section>

      <section className="panel p-3 md:p-4">
        <h2 className="label">Insurance</h2>
        <p className="text-sm"><b>{INSURANCE[store.insuranceStatus]}</b>{store.insuranceNote ? ` · ${store.insuranceNote}` : ""}</p>
        {!premium && <p className="mt-1 text-xs text-gray-500">Eligibility for applicable insurance arrangements is part of the Premium plan.</p>}
        {premium && store.insuranceStatus === "NONE" && canManage && <div className="mt-2"><RequestInsurance storeId={store.id} /></div>}
      </section>

      <section className="panel p-3 md:p-4">
        <h2 className="label">Order &amp; tracking API</h2>
        {!apiAllowed(store) ? (
          <p className="text-sm text-gray-500">{premium ? "Available once the store is active." : "Order and tracking integration is available on the Premium plan. Starter partners place orders in the portal or by CSV and follow tracking here."}</p>
        ) : (
          <div className="space-y-3">
            <ul className="divide-y divide-line border border-line text-sm">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className={k.revokedAt ? "text-gray-400 line-through" : ""}><b>{k.name}</b> <code className="text-xs">{k.prefix}…</code><span className="block text-xs text-gray-500">created {fmtDate(k.createdAt)} · last used {k.lastUsedAt ? fmtDate(k.lastUsedAt) : "never"}{k.revokedAt ? " · revoked" : ""}</span></span>
                  {!k.revokedAt && (canManage || isAdmin) && <RevokeKey storeId={store.id} keyId={k.id} />}
                </li>
              ))}
              {!keys.length && <li className="px-3 py-2 text-gray-500">No keys yet.</li>}
            </ul>
            {canManage && <NewKey storeId={store.id} />}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-navy">How to use it</summary>
              <pre className="mt-2 overflow-x-auto border border-line bg-soft p-3 text-xs">{`# create + submit an order (idempotent on externalRef)
curl -X POST ${base}/api/v1/orders \\
  -H "Authorization: Bearer rxk_..." -H "Content-Type: application/json" \\
  -d '{"externalRef":"WEB-1001","customer":{"name":"Jane Smith","email":"jane@example.com",
       "phone":"5125550100","line1":"1 Main St","city":"Austin","region":"TX","postalCode":"78701","country":"US"},
       "items":[{"sku":"BPC-157-5MG","qty":2}]}'

# status + tracking
curl ${base}/api/v1/orders/<id> -H "Authorization: Bearer rxk_..."
curl "${base}/api/v1/orders?externalRef=WEB-1001" -H "Authorization: Bearer rxk_..."`}</pre>
              <p className="mt-1 text-xs text-gray-500">Amounts are integer cents (USD). 201 = submitted, 202 = saved as draft (see &quot;warning&quot;), 409 = duplicate externalRef, 422 = invalid, 429 = more than 60 requests/minute.</p>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
