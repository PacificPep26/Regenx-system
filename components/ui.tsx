import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { OrderStatus, StatementStatus } from "@prisma/client";
import { formatUSD } from "@/lib/money";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "border-gray-300 text-gray-600",
  ON_HOLD: "border-red text-red",
  APPROVED: "border-navy text-navy",
  PACKING: "border-warn text-warn",
  SHIPPED: "border-ok text-ok",
  DELIVERED: "bg-ok text-white border-ok",
  CANCELLED: "border-gray-300 text-gray-400 line-through",
  ISSUED: "border-navy text-navy",
  PAID: "bg-ok text-white border-ok",
  OVERDUE: "bg-red text-white border-red",
  ACTIVE: "border-ok text-ok",
  PENDING: "border-warn text-warn",
  SUSPENDED: "bg-red text-white border-red",
};

export function Badge({ value }: { value: OrderStatus | StatementStatus | string }) {
  return (
    <span className={`inline-block border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLE[value] ?? "border-line"}`}>
      {value.replace("_", " ")}
    </span>
  );
}

export function Money({ cents, show = true, className = "" }: { cents: number | null | undefined; show?: boolean; className?: string }) {
  if (!show) return <span className="text-gray-400">•••</span>;
  if (cents == null) return <span className="text-gray-400">—</span>;
  return <span className={`tabular-nums ${cents < 0 ? "text-red" : ""} ${className}`}>{formatUSD(cents)}</span>;
}

export function PageHeader({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-lg font-bold text-navy md:text-xl">{title}</h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children = "No results." }: { children?: React.ReactNode }) {
  return <div className="panel p-8 text-center text-sm text-gray-500">{children}</div>;
}

export function Stat({ label, cents, tone = "navy", show = true }: { label: string; cents: number; tone?: "navy" | "red" | "ok"; show?: boolean }) {
  const border = { navy: "border-navy", red: "border-red", ok: "border-ok" }[tone];
  return (
    <div className={`panel border-l-4 ${border} p-2 md:p-3`}>
      <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-500 md:text-[11px]">{label}</div>
      <div className="mt-0.5 text-base font-bold md:mt-1 md:text-lg"><Money cents={cents} show={show} /></div>
    </div>
  );
}

export function Pager({ page, pages, params }: { page: number; pages: number; params: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => "?" + new URLSearchParams({ ...clean(params), page: String(p) }).toString();
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      {page > 1 ? <Link className="btn" href={href(page - 1)}><ChevronLeft size={16} /> Prev</Link> : <span />}
      <span className="text-gray-500">{page} / {pages}</span>
      {page < pages ? <Link className="btn" href={href(page + 1)}>Next <ChevronRight size={16} /></Link> : <span />}
    </div>
  );
}

export const clean = (o: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== "")) as Record<string, string>;

export const fmtDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(d) : "—";
