"use client";

import { useState } from "react";

/** Renders the first `step` items and a button for the next ones (long lists inside a dashboard card). */
export function ShowMore({ items, step = 10 }: { items: React.ReactNode[]; step?: number }) {
  const [n, setN] = useState(step);
  return (
    <>
      {items.slice(0, n)}
      {items.length > n && (
        <li className="col-span-full p-1 text-center">
          <button type="button" className="btn h-8 text-xs" onClick={() => setN(n + step)}>
            Show {Math.min(step, items.length - n)} more ({items.length - n} left)
          </button>
        </li>
      )}
    </>
  );
}
