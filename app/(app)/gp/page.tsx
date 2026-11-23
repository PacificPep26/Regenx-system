import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { GpBoard } from "@/components/GpBoard";
import type { SP } from "@/lib/query";

export default async function GpDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  if (u.role === "ADMIN") redirect("/overview"); // admin sees the warehouse board on Home
  return <GpBoard searchParams={searchParams} />;
}
