import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ReportView } from "@/components/ReportView";
import type { SP } from "@/lib/query";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole("ADMIN");
  return (
    <div className="space-y-4">
      <PageHeader title="Reports · all stores" />
      <ReportView sp={await searchParams} scope={{}} basePath="/reports" withStoreFilter />
    </div>
  );
}
