import { redirect } from "next/navigation";

// chat was removed; keep old links working
export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/s/${(await params).slug}/dashboard`);
}
