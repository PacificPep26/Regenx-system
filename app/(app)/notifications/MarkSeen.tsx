"use client";

import { useEffect } from "react";
import { markNotificationsSeen } from "@/app/actions/chat";

/** Clears the unread badge after the list has rendered (bold rows stay bold for this view). */
export function MarkSeen() {
  useEffect(() => {
    markNotificationsSeen();
  }, []);
  return null;
}
