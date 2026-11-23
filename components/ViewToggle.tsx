"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function ViewToggle() {
  const sp = useSearchParams();
  const path = usePathname();
  const view = sp.get("view") === "board" ? "board" : "table";
  const href = (v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v === "table") n.delete("view");
    else n.set("view", v);
    n.delete("page");
    return `${path}?${n.toString()}`;
  };
  return (
    <div className="flex">
      {["table", "board"].map((v) => (
        <Link key={v} href={href(v)} className={`btn capitalize ${view === v ? "border-navy bg-navy text-white hover:bg-navy" : ""}`}>
          {v}
        </Link>
      ))}
    </div>
  );
}
