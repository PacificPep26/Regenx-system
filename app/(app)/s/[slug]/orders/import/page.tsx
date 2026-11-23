import { notFound } from "next/navigation";
import { requireStore } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ImportForm } from "./ImportForm";

export default async function ImportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store, canEdit } = await requireStore(slug);
  if (!canEdit) notFound();
  return (
    <div className="max-w-4xl">
      <PageHeader title="Import orders (CSV)" />
      <ImportForm storeId={store.id} slug={slug} />
    </div>
  );
}
