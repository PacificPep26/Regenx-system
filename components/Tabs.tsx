"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ tabs }: { tabs: [string, string][] }) {
  const path = usePathname();
  return (
    <div className="-mx-4 mb-4 flex overflow-x-auto print:hidden border-b border-line px-4 md:mx-0 md:px-0">
      {tabs.map(([href, label]) => {
        const on = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${on ? "border-red font-semibold text-navy" : "border-transparent text-gray-600"}`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
