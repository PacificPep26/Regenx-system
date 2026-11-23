import { requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { changePassword, logoutEverywhere } from "@/app/actions/auth";
import { PageHeader } from "@/components/ui";

export default async function AccountPage() {
  const u = await requireUser();
  return (
    <div className="max-w-md space-y-4">
      <PageHeader title="Account" />
      <div className="panel p-3 text-sm">
        <div className="font-semibold">{u.name}</div>
        <div className="text-gray-500">{u.email}</div>
        <div className="text-gray-500">{u.role.replace("_", " ").toLowerCase()}{u.store ? ` · ${u.store.name}` : ""}</div>
      </div>
      <section className="panel p-3">
        <h2 className="label mb-3">Change password</h2>
        <ActionForm action={changePassword} submit="Change password">
          <div><label className="label">Current</label><input name="current" type="password" autoComplete="current-password" required className="input" /></div>
          <div><label className="label">New (min 10)</label><input name="next" type="password" autoComplete="new-password" minLength={10} required className="input" /></div>
        </ActionForm>
      </section>
      <form action={logoutEverywhere}>
        <button className="btn w-full text-red">Sign out on all devices</button>
      </form>
    </div>
  );
}
