"use client";

import { useTransition } from "react";
import { setUserActive } from "@/app/actions/ops";

export function UserToggle({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button className={`btn h-8 text-xs ${active ? "text-red" : ""}`} disabled={pending} onClick={() => start(async () => void (await setUserActive(id, !active)))}>
      {active ? "Deactivate" : "Activate"}
    </button>
  );
}
