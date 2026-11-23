import { redirect } from "next/navigation";

export default async function StoreHome({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/s/${(await params).slug}/dashboard`);
}
