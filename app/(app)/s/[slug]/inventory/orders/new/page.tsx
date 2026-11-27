import { redirect } from "next/navigation";

// adding inventory now happens on the Inventory page; keep old links working
export default async function NewInventoryOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  redirect(`/s/${(await params).slug}/inventory?add=1`);
}
