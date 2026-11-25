import { redirect } from "next/navigation";

// the messages inbox was removed; keep old links working
export default function InboxPage() {
  redirect("/");
}
