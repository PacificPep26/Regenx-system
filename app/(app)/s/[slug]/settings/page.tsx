import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { addPayment, addAdjustment, updateStore, inviteUser } from "@/app/actions/ops";
import { UserToggle } from "./UserToggle";
import { Money, fmtDate } from "@/components/ui";

export default async function StoreSettings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store, isAdmin } = await requireStore(slug);
  if (!isAdmin) notFound();
  const [users, payments] = await Promise.all([
    db.user.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "asc" } }),
    db.payment.findMany({ where: { storeId: store.id }, orderBy: { receivedAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className="panel p-3 md:p-4">
        <h2 className="label mb-3">Record payment</h2>
        <ActionForm action={addPayment} submit="Record payment">
          <input type="hidden" name="storeId" value={store.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><label className="label">Amount ($)</label><input name="amount" required inputMode="decimal" className="input" /></div>
            <div>
              <label className="label">Method</label>
              <select name="method" className="input">{["WIRE", "ACH", "CHECK", "CARD", "OTHER"].map((m) => <option key={m}>{m}</option>)}</select>
            </div>
            <div><label className="label">Reference</label><input name="reference" className="input" /></div>
          </div>
          <p className="text-xs text-gray-500">Applied to outstanding → shipping → credit.</p>
        </ActionForm>
        {payments.length > 0 && (
          <ul className="mt-4 divide-y divide-line border border-line text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between px-3 py-2"><span>{fmtDate(p.receivedAt)} · {p.method} {p.reference}</span><Money cents={p.amountCents} /></li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-3 md:p-4">
        <h2 className="label mb-3">Ledger adjustment</h2>
        <ActionForm action={addAdjustment} submit="Post adjustment" danger>
          <input type="hidden" name="storeId" value={store.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Bucket</label>
              <select name="bucket" className="input"><option>CREDIT</option><option>OUTSTANDING</option><option>SHIPPING</option></select>
            </div>
            <div><label className="label">Amount ± ($)</label><input name="amount" required inputMode="decimal" className="input" placeholder="-25.00" /></div>
            <div><label className="label">Memo *</label><input name="memo" required className="input" /></div>
          </div>
        </ActionForm>
      </section>

      <section className="panel p-3 md:p-4">
        <h2 className="label mb-3">Store</h2>
        <ActionForm action={updateStore} submit="Save store">
          <input type="hidden" name="storeId" value={store.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="label">Name</label><input name="name" defaultValue={store.name} className="input" /></div>
            <div>
              <label className="label">Tier</label>
              <select name="tier" defaultValue={store.tier} className="input"><option value="STARTER">Starter · $10k · 5%</option><option value="PREMIUM">Premium · $50k · 10%</option></select>
            </div>
            <div>
              <label className="label">Status</label>
              <select name="status" defaultValue={store.status} className="input"><option>PENDING</option><option>ACTIVE</option><option>SUSPENDED</option></select>
            </div>
            <div><label className="label">Allowed regions</label><input name="regions" defaultValue={store.allowedRegions.join(", ")} className="input" placeholder="US, CA, VN or US-TX, US-CA" /></div>
            <div className="sm:col-span-2"><label className="label">Branding / UPC labeling instructions (shown to GP)</label><textarea name="labelNotes" defaultValue={store.labelNotes ?? ""} rows={3} className="input h-auto py-2" /></div>
            <div>
              <label className="label">Insurance (Premium)</label>
              <select name="insuranceStatus" defaultValue={store.insuranceStatus} className="input"><option value="NONE">Not requested</option><option value="REQUESTED">Requested</option><option value="ACTIVE">Active</option></select>
            </div>
            <div><label className="label">Insurance note</label><input name="insuranceNote" defaultValue={store.insuranceNote ?? ""} className="input" placeholder="e.g. additional insured per policy #..." /></div>
            <div className="sm:col-span-2"><label className="label">Logo URL</label><input name="brandingLogoUrl" defaultValue={store.brandingLogoUrl ?? ""} className="input" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowRestricted" defaultChecked={store.allowRestricted} className="h-4 w-4" /> Cleared for restricted SKUs</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="hideAmountsFromStaff" defaultChecked={store.hideAmountsFromStaff} className="h-4 w-4" /> Hide $ from staff</label>
          </div>
        </ActionForm>
      </section>

      <section className="panel p-3 md:p-4">
        <h2 className="label mb-3">Users</h2>
        <ul className="mb-4 divide-y divide-line border border-line text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className={u.active ? "font-medium" : "text-gray-400 line-through"}>{u.name}</div>
                <div className="truncate text-xs text-gray-500">{u.email} · {u.role.replace("_", " ").toLowerCase()}</div>
              </div>
              <UserToggle id={u.id} active={u.active} />
            </li>
          ))}
          {!users.length && <li className="px-3 py-2 text-gray-500">No users.</li>}
        </ul>
        <ActionForm action={inviteUser} submit="Add user">
          <input type="hidden" name="storeId" value={store.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><label className="label">Name</label><input name="name" required className="input" /></div>
            <div><label className="label">Email</label><input name="email" type="email" required className="input" /></div>
            <div>
              <label className="label">Role</label>
              <select name="role" className="input"><option value="PARTNER_OWNER">Owner</option><option value="PARTNER_STAFF">Staff</option></select>
            </div>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
