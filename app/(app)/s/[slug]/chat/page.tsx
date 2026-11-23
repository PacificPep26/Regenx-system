import { db } from "@/lib/db";
import { requireStore } from "@/lib/auth";
import { Chat } from "@/components/Chat";

export default async function ChatPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ order?: string }> }) {
  const { slug } = await params;
  const { order } = await searchParams;
  const { store } = await requireStore(slug);
  const o = order ? await db.order.findFirst({ where: { id: order, storeId: store.id }, select: { id: true, number: true } }) : null;
  return <Chat storeId={store.id} slug={slug} orderId={o?.id} orderNumber={o?.number} />;
}
