import { notFound } from "next/navigation";
import { requireStore } from "@/lib/auth";
import { CustomerForm } from "@/components/CustomerForm";
import { PageHeader } from "@/components/ui";

export default async function NewCustomerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { store, canEdit } = await requireStore(slug);
  if (!canEdit) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title="New customer" />
      <div className="panel p-3 md:p-4">
        <CustomerForm storeId={store.id} values={{ country: "US" }} />
      </div>
    </div>
  );
}
