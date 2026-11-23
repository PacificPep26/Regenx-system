import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { str, pageOf, flat, type SP } from "@/lib/query";
import { FilterBar } from "@/components/FilterBar";
import { Empty, PageHeader, Pager } from "@/components/ui";

type Row = { id: string; name: string; slug: string; body: string; createdAt: Date; authorId: string; author: string; lastReadAt: Date | null; total: number };

/** Conversations (one per store), newest first. One SQL statement; only stores that have messages; paginated and searchable. */
export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireRole("ADMIN", "FULFILLMENT");
  const sp = await searchParams;
  const q = str(sp, "q");
  const unreadOnly = str(sp, "unread") === "yes";
  const { page, skip, take } = pageOf(sp, 25);
  const like = q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : null;

  const rows = await db.$queryRaw<Row[]>`
    SELECT s.id, s.name, s.slug, m.body, m."createdAt", m."authorId", COALESCE(a.name, '') AS author, r."lastReadAt",
           COUNT(*) OVER ()::int AS total
    FROM "Store" s
    JOIN LATERAL (
      SELECT body, "createdAt", "authorId" FROM "Message" WHERE "storeId" = s.id ORDER BY "createdAt" DESC LIMIT 1
    ) m ON TRUE
    LEFT JOIN "User" a ON a.id = m."authorId"
    LEFT JOIN "ChatRead" r ON r."storeId" = s.id AND r."userId" = ${u.id}
    WHERE TRUE
      ${like ? Prisma.sql`AND (s.name ILIKE ${like} OR s.slug ILIKE ${like})` : Prisma.empty}
      ${unreadOnly ? Prisma.sql`AND m."authorId" <> ${u.id} AND m."createdAt" > COALESCE(r."lastReadAt", 'epoch'::timestamp)` : Prisma.empty}
    ORDER BY m."createdAt" DESC
    LIMIT ${take} OFFSET ${skip}`;
  const total = rows[0]?.total ?? 0;

  return (
    <div className="max-w-3xl space-y-3">
      <PageHeader title="Inbox" />
      <FilterBar
        fields={[
          { type: "search", key: "q", placeholder: "Search store…" },
          { type: "select", key: "unread", label: "Show", options: [{ value: "yes", label: "Unread only" }] },
        ]}
      />
      {!rows.length ? (
        <Empty>{q || unreadOnly ? "No conversations match." : "No messages yet."}</Empty>
      ) : (
        <>
          <ul className="divide-y divide-line border border-line">
            {rows.map((r) => {
              const unread = r.authorId !== u.id && (!r.lastReadAt || r.createdAt > r.lastReadAt);
              return (
                <li key={r.id}>
                  <Link href={`/s/${r.slug}/chat`} className={`block border-l-4 p-3 hover:bg-hover ${unread ? "border-red" : "border-transparent"}`}>
                    <div className="flex justify-between gap-2">
                      <span className={`truncate text-navy ${unread ? "font-bold" : "font-medium"}`}>{r.name}</span>
                      <span className="shrink-0 text-xs text-gray-500">{r.createdAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="truncate text-sm text-gray-600">{r.author ? `${r.author}: ` : ""}{r.body}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pager page={page} pages={Math.ceil(total / take)} params={flat(sp)} />
        </>
      )}
    </div>
  );
}
