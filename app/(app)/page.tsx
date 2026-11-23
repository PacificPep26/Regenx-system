import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function Home() {
  const u = await requireUser();
  if (u.role === "ADMIN") redirect("/overview");
  if (u.role === "FULFILLMENT") redirect("/gp");
  if (!u.store) redirect("/account");
  redirect(`/s/${u.store.slug}/dashboard`);
}
