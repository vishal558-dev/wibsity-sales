import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>

      <section className="flex flex-col gap-3" aria-label="Loading today's actions">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-56" />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <section key={index} className="flex flex-col gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-64" />
          </section>
        ))}
      </div>
    </>
  );
}
