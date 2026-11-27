"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@prisma/client";
import {
  Bell, Menu, X, LayoutDashboard, Gauge, Truck, Store, FileText, Package, Search,
  Contact, Boxes, BarChart3, ChevronDown, Wallet, ShieldCheck, UserRound, LogOut, type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { NotificationBell } from "./NotificationBell";
import type { Unread } from "@/lib/notify";

export type NavStore = { id: string; slug: string; name: string; health: "green" | "yellow" | "red" | "grey"; showMoney: boolean; newOrders: number };

const DOT = { green: "bg-ok", yellow: "bg-warn", red: "bg-red", grey: "bg-gray-300" };
type Item = [href: string, label: string, icon: LucideIcon];

export function Nav({ role, userName, stores, totalStores = stores.length, unread }: { role: Role; userName: string; stores: NavStore[]; totalStores?: number; unread: Unread }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const [live, setLive] = useState<Unread & { newOrders?: Record<string, number> }>(unread);
  const [toast, setToast] = useState<{ title: string; link: string | null } | null>(null);
  const seenLatest = useRef(unread.latest?.id);
  const livePath = useRef(path);
  livePath.current = path;

  // a server render (navigation / refresh) is the freshest truth; adopt it
  useEffect(() => {
    setLive(unread);
    seenLatest.current = unread.latest?.id;
  }, [unread]);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/unread", { cache: "no-store" });
        if (!r.ok || stop) return;
        const d: Unread & { newOrders: Record<string, number> } = await r.json();
        setLive(d);
        if (d.latest && d.latest.id !== seenLatest.current) {
          seenLatest.current = d.latest.id;
          // no toast for what the user is already looking at (e.g. the open chat)
          if (d.notifications > 0 && d.latest.link !== livePath.current) setToast({ title: d.latest.title, link: d.latest.link });
        }
      } catch {
        /* offline: keep last numbers */
      }
    };
    const t = setInterval(poll, 8000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    setOpen(false);
  }, [path]);

  // frequent items stay on top; rarely-needed admin pages are grouped under "Manage" at the bottom
  const primary: Item[] =
    role === "ADMIN"
      ? [["/overview", "Home", LayoutDashboard], ["/fulfillment", "Orders to ship", Truck], ["/reports", "Reports", BarChart3]]
      : role === "FULFILLMENT"
        ? [["/gp", "Home", Gauge], ["/earnings", "Earnings", Wallet]]
        : [["/catalog", "Price list", Package]];
  const manage: Item[] =
    role === "ADMIN"
      ? [["/stores", "Stores", Store], ["/customers", "Customers", Contact], ["/stock", "Stock", Boxes], ["/statements", "Statements", FileText], ["/catalog", "Catalog", Package], ["/topups", "Top-up requests", Wallet], ["/payouts", "GP payouts", Wallet], ["/users", "Users", ShieldCheck], ["/search", "Search", Search]]
      : role === "FULFILLMENT"
        ? [["/stock", "Stock", Boxes], ["/stores", "Stores", Store], ["/customers", "Customers", Contact], ["/catalog", "Catalog", Package], ["/search", "Search", Search]]
        : [["/search", "Search", Search]];
  const [storeQ, setStoreQ] = useState("");
  const shownStores = stores.filter((x) => x.name.toLowerCase().includes(storeQ.trim().toLowerCase()));
  const storeAlerts = stores.reduce((n, x) => n + (live.newOrders?.[x.id] ?? x.newOrders), 0);
  // a partner has one store: no collapsible "Stores" group, just the link
  const isPartner = role.startsWith("PARTNER");
  const Wrap: React.ElementType = isPartner ? "div" : "details";
  const manageActive = manage.some(([h]) => path === h || path.startsWith(h + "/"));

  const link = ([href, label, Icon]: Item, indent = false, count = 0) => {
    const active = path === href || (href !== "/" && path.startsWith(href + "/"));
    return (
      <Link
        key={href}
        href={href}
        className={`flex items-center gap-2.5 border-l-4 py-2 pr-3 text-sm ${indent ? "pl-8" : "pl-4"} ${
          active ? "border-red bg-soft font-semibold text-navy" : "border-transparent text-gray-700 hover:bg-hover"
        }`}
      >
        <Icon size={16} strokeWidth={1.75} className="shrink-0" />
        <span className="flex-1">{label}</span>
        {count > 0 && <span className="bg-red px-1.5 text-[11px] font-bold text-white">{count}</span>}
      </Link>
    );
  };
  const bell = <NotificationBell unread={live.notifications} />;

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b-2 border-red bg-white px-4 print:hidden md:hidden">
        <Link href="/" className="font-bold tracking-wide text-navy">REGENX</Link>
        <div className="flex gap-2">
          {bell}
          <button className="btn h-9 w-9 px-0" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-hidden border-r border-line bg-white transition-transform print:hidden md:sticky md:top-0 md:h-dvh md:w-60 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b-2 border-red px-4 py-4">
          <div>
            <div className="font-bold tracking-wide text-navy">REGENX</div>
            <div className="text-xs text-gray-500">Distribution &amp; Fulfillment</div>
          </div>
          <div className="hidden md:block">{bell}</div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto py-2">
          {primary.map((it) => link(it))}
          {stores.length > 0 && (
            <Wrap {...(isPartner ? {} : { open: true })} className="group mt-2">
              {!isPartner && (
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:bg-hover [&::-webkit-details-marker]:hidden">
                <span>Stores · {totalStores}</span>
                <span className="flex items-center gap-2">
                  {storeAlerts > 0 && <span className="bg-red px-1.5 text-[10px] font-bold text-white group-open:hidden">{storeAlerts}</span>}
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                </span>
              </summary>
              )}
              {stores.length > 5 && (
                <div className="px-3 pb-1">
                  <input type="search" className="input h-8 text-xs" placeholder="Filter stores…" value={storeQ} onChange={(e) => setStoreQ(e.target.value)} aria-label="Filter stores" />
                </div>
              )}
              <div className="max-h-[38dvh] overflow-y-auto">
                {shownStores.map((s) => {
                  const base = `/s/${s.slug}`;
                  const inStore = path.startsWith(base + "/") || path === base;
                  const fresh = live.newOrders?.[s.id] ?? s.newOrders;
                  return (
                    <Link key={s.slug} href={`${base}/dashboard`} className={`flex items-center gap-2 border-l-4 py-2 pl-3 pr-3 text-sm ${inStore ? "border-red bg-soft font-semibold text-navy" : "border-transparent text-gray-700 hover:bg-hover"}`}>
                      <span className={`h-2.5 w-2.5 shrink-0 ${DOT[s.health]}`} />
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                                            {fresh > 0 && (
                        <span className="flex items-center gap-0.5 bg-red px-1.5 text-[11px] font-bold text-white" title={`${fresh} new order(s)`}>
                          <Bell size={10} strokeWidth={2.5} />
                          {fresh}
                        </span>
                      )}
                    </Link>
                  );
                })}
                {!shownStores.length && <p className="px-4 py-2 text-xs text-gray-500">No match. Use All stores for more.</p>}
              </div>
              {(role === "ADMIN" || role === "FULFILLMENT") && totalStores > stores.length && (
                <Link href="/stores" className="block px-4 py-2 text-sm font-medium text-navy hover:bg-hover">All stores ({totalStores}) →</Link>
              )}
            </Wrap>
          )}
        </nav>
        <div className="shrink-0 border-t border-line py-2">
          {manage.length > 0 && (
            <details key={manageActive ? "open" : "closed"} open={manageActive} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:bg-hover [&::-webkit-details-marker]:hidden">
                More
                <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
              </summary>
              {manage.map((it) => link(it))}
            </details>
          )}
          <div className="px-4 py-1 text-xs text-gray-500">{userName} · {role.replace("_", " ").toLowerCase()}</div>
          {link(["/account", "Account", UserRound])}
          <form action={logout}>
            <button className="flex w-full items-center gap-2.5 py-2 pl-5 text-left text-sm text-red hover:bg-hover">
              <LogOut size={16} strokeWidth={1.75} /> Sign out
            </button>
          </form>
        </div>
      </aside>
      {toast && (
        <div role="status" className="fixed right-3 top-16 z-[70] w-[calc(100vw-1.5rem)] max-w-sm border border-line border-l-4 border-l-red bg-white p-3 shadow-lg md:top-3">
          <div className="flex items-start gap-2">
            <Bell size={16} className="mt-0.5 shrink-0 text-red" />
            {toast.link ? (
              <Link href={toast.link} onClick={() => setToast(null)} className="flex-1 text-sm font-medium text-navy hover:underline">{toast.title}</Link>
            ) : (
              <span className="flex-1 text-sm font-medium text-navy">{toast.title}</span>
            )}
            <button className="shrink-0 text-gray-400 hover:text-navy" aria-label="Dismiss" onClick={() => setToast(null)}><X size={14} /></button>
          </div>
        </div>
      )}
    </>
  );
}
