"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const within = (path: string, href: string) => path === href || path.startsWith(href + "/");

// tab = [href, label, also?]: `also` lists other hrefs that keep this tab highlighted (a grouped tab)
// `onlyIn`: render this row only while the current page is under one of these hrefs (a sub-row)
export function Tabs({ tabs, onlyIn }: { tabs: ([string, string] | [string, string, string[]])[]; onlyIn?: string[] }) {
  const path = usePathname();
  if (onlyIn && !onlyIn.some((h) => within(path, h))) return null;
  return (
    <div className={`-mx-4 flex overflow-x-auto print:hidden border-b border-line px-4 md:mx-0 md:px-0 ${onlyIn ? "mb-4 bg-soft" : "mb-4"}`}>
      {tabs.map(([href, label, also]) => {
        const on = [href, ...(also ?? [])].some((h) => within(path, h));
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
