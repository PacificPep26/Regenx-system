import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { str, list, pageOf, flat, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { ActionForm } from "@/components/ActionForm";
import { inviteUser } from "@/app/actions/ops";
import { Empty, PageHeader, Pager, fmtDate } from "@/components/ui";
import { UserActions } from "./UserActions";

const ROLES: Role[] = ["ADMIN", "FULFILLMENT", "PARTNER_OWNER", "PARTNER_STAFF"];

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireRole("ADMIN");
  const sp = await searchParams;
  const q = str(sp, "q");
  const roles = list(sp, "role", ROLES);
  const store = str(sp, "store");
  const state = str(sp, "state");
  const where = {
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(roles ? { role: { in: roles } } : {}),
    ...(store ? { store: { slug: store } } : {}),
    ...(state ? { active: state === "active" } : {}),
  };
  const { page, skip, take } = pageOf(sp, 30);
  const [rows, count, stores] = await Promise.all([
    db.user.findMany({ where, orderBy: [{ role: "asc" }, { name: "asc" }], skip, take, include: { store: { select: { name: true } } } }),
    db.user.count({ where }),
    db.store.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } }),
  ]);
  const pendingResets = await db.passwordReset.findMany({ where: { usedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true } });
  const asked = new Set(pendingResets.map((r) => r.userId));

  return (
    <div className="space-y-4">
      <PageHeader title="Users" />
      <FilterBar
        fields={[
          { type: "search", key: "q", placeholder: "Search name or email…" },
          { type: "multi", key: "role", label: "Role", options: ROLES.map((r) => ({ value: r, label: r.replace("_", " ") })) },
          { type: "select", key: "store", label: "Store", options: stores.map((s) => ({ value: s.slug, label: s.name })) },
          { type: "select", key: "state", label: "State", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
        ]}
      />
      {!rows.length ? (
        <Empty>No users match.</Empty>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {rows.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className={`font-medium ${u.active ? "" : "text-gray-400 line-through"}`}>
                  {u.name} {asked.has(u.id) && <span className="ml-1 border border-red px-1 text-[10px] font-bold text-red">RESET REQUESTED</span>}
                </div>
                <div className="truncate text-xs text-gray-500">{u.email} · {u.role.replace("_", " ").toLowerCase()}{u.store ? ` · ${u.store.name}` : ""} · since {fmtDate(u.createdAt)}</div>
              </div>
              <UserActions id={u.id} active={u.active} self={u.id === me.id} />
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />

      <section className="panel max-w-2xl p-3 md:p-4">
        <h2 className="label mb-3">Add user</h2>
        <ActionForm action={inviteUser} submit="Add user">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="label">Name</label><input name="name" required className="input" /></div>
            <div><label className="label">Email</label><input name="email" type="email" required className="input" /></div>
            <div>
              <label className="label">Role</label>
              <select name="role" className="input">{ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}</select>
            </div>
            <div>
              <label className="label">Store (partner roles)</label>
              <select name="storeId" className="input"><option value="">—</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </div>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
