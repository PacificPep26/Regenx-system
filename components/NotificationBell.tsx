"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { openNotifications, type NotificationItem } from "@/app/actions/notifications";

const fmt = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function NotificationBell({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const toggle = () => {
    if (open) return setOpen(false);
    setOpen(true);
    setItems(null);
    openNotifications().then((r) => {
      setItems(r);
      if (unread) router.refresh(); // clear the badge
    });
  };

  return (
    <>
      <button onClick={toggle} aria-label="Notifications" aria-expanded={open} className="btn relative h-9 w-9 px-0">
        <Bell size={18} strokeWidth={1.75} />
        {unread > 0 && <span className="absolute -right-1.5 -top-1.5 bg-red px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open &&
        // portal: the sidebar is transformed + scrollable, which would clip a fixed panel
        createPortal(
          <>
            <div className="fixed inset-0 z-50 bg-black/20 md:bg-transparent" onClick={() => setOpen(false)} />
            <div
              role="dialog"
              aria-label="Notifications"
              className="fixed inset-x-0 top-14 z-50 flex max-h-[75dvh] flex-col border-y-2 border-red bg-white shadow-lg md:inset-x-auto md:left-60 md:top-3 md:ml-2 md:w-96 md:border md:border-t-2 md:border-line md:border-t-red"
            >
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="font-semibold text-navy">Notifications</span>
                <button className="btn h-8 w-8 px-0" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {items === null && <p className="p-4 text-sm text-gray-500">Loading…</p>}
                {items?.length === 0 && <p className="p-4 text-sm text-gray-500">Nothing yet.</p>}
                <ul className="divide-y divide-line">
                  {items?.map((n) => {
                    const inner = (
                      <>
                        <div className="flex justify-between gap-2">
                          <span className={`text-sm ${n.fresh ? "font-bold text-navy" : ""}`}>{n.title}</span>
                          <span className="shrink-0 text-[11px] text-gray-500">{fmt(n.at)}</span>
                        </div>
                        {(n.store || n.body) && <div className="truncate text-xs text-gray-500">{[n.store, n.body].filter(Boolean).join(" · ")}</div>}
                      </>
                    );
                    return (
                      <li key={n.id} className={`border-l-4 ${n.fresh ? "border-red" : "border-transparent"}`}>
                        {n.link ? (
                          <Link href={n.link} onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-hover">{inner}</Link>
                        ) : (
                          <div className="px-3 py-2">{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <Link href="/notifications" onClick={() => setOpen(false)} className="border-t border-line px-3 py-2 text-center text-sm font-medium text-navy hover:bg-hover">
                View all
              </Link>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
