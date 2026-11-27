"use client";

import { usePathname } from "next/navigation";
import { formatUSD } from "@/lib/money";

/** One slim line of balances on every store tab; the dashboard tab has its own full deposit panel, so it hides there. */
export function StoreBalanceStrip({ credit, required, outstanding, shipping }: { credit: number; required: number; outstanding: number; shipping: number }) {
  if (usePathname().endsWith("/dashboard")) return null;
  const chip = (label: string, cents: number, warn = false) => (
    <span className={`flex flex-col border-l-4 px-2 py-1 sm:block ${warn ? "border-red" : "border-line"}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>{" "}
      <b className={`tabular-nums ${warn ? "text-red" : ""}`}>{formatUSD(cents)}</b>
    </span>
  );
  return (
    <div className="mb-3 grid grid-cols-3 border border-line bg-white text-sm print:hidden sm:flex sm:flex-wrap sm:gap-x-3 sm:gap-y-1">
      <span className={`flex flex-col border-l-4 px-2 py-1 sm:block ${credit < required * 0.3 ? "border-red" : "border-ok"}`}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Credit</span> <b className="tabular-nums">{formatUSD(credit)}</b>
        <span className="hidden text-xs text-gray-400 sm:inline"> / {formatUSD(required)}</span>
      </span>
      {chip("Outstanding", outstanding, outstanding > 0)}
      {chip("Shipping due", shipping, shipping > 0)}
    </div>
  );
}
