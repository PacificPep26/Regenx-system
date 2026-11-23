import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { notificationWhere } from "@/lib/notify";
import { pageOf, flat, type SP } from "@/lib/query";
import { Empty, PageHeader, Pager } from "@/components/ui";
import { MarkSeen } from "./MarkSeen";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const where = notificationWhere(u);
  const { page, skip, take } = pageOf(sp, 40);
  const [rows, count] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { store: { select: { name: true } } } }),
    db.notification.count({ where }),
  ]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Notifications" />
      <MarkSeen />
      {!rows.length ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {rows.map((n) => {
            const fresh = n.createdAt > u.notificationsSeenAt;
            const inner = (
              <>
                <div className="flex justify-between gap-2">
                  <span className={fresh ? "font-bold text-navy" : ""}>{n.title}</span>
                  <span className="shrink-0 text-xs text-gray-500">{n.createdAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {(() => {
                  const sub = [u.role === "ADMIN" || u.role === "FULFILLMENT" ? n.store?.name : null, n.body].filter(Boolean).join(" · ");
                  return sub ? <div className="truncate text-sm text-gray-500">{sub}</div> : null;
                })()}
              </>
            );
            return (
              <li key={n.id} className={`border-l-4 ${fresh ? "border-red" : "border-transparent"}`}>
                {n.link ? <Link href={n.link} className="block p-3 hover:bg-hover">{inner}</Link> : <div className="p-3">{inner}</div>}
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} pages={Math.ceil(count / take)} params={flat(sp)} />
    </div>
  );
}
