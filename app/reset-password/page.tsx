import { AuthCard } from "@/components/AuthCard";
import { ResetForm } from "./ResetForm";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password">
      <ResetForm token={token ?? ""} />
    </AuthCard>
  );
}
