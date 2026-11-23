"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markOrdersSeen } from "@/app/actions/chat";

/** Clears the store's red "new orders" badge after the Orders page is opened. */
export function MarkOrdersSeen({ storeId, pending }: { storeId: string; pending: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    markOrdersSeen(storeId).then(() => router.refresh());
  }, [storeId, pending, router]);
  return null;
}
