export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col border-t-4 border-red bg-white md:items-center md:justify-center md:bg-soft">
      <div className="w-full bg-white p-6 md:max-w-sm md:border md:border-line md:border-t-4 md:border-t-navy">
        <div className="mb-6">
          <div className="text-xl font-bold tracking-wide text-navy">REGENX LABS</div>
          <div className="text-sm text-gray-500">{title}</div>
        </div>
        {children}
      </div>
    </main>
  );
}
