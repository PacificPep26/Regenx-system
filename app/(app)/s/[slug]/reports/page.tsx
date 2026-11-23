import { notFound } from "next/navigation";
import { requireStore } from "@/lib/auth";
import { ReportView } from "@/components/ReportView";
import type { SP } from "@/lib/query";

export default async function StoreReports({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const { store, canSeeMoney } = await requireStore(slug);
  if (!canSeeMoney) notFound();
  return <ReportView sp={await searchParams} scope={{ storeId: store.id }} basePath={`/s/${slug}/reports`} />;
}
