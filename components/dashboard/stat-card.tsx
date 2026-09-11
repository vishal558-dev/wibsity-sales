export function StatCard({
  label,
  value,
  accentClassName = "bg-primary",
}: {
  label: string;
  value: number;
  accentClassName?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className={`h-0.5 w-full ${accentClassName}`} />
      <div className="flex flex-col gap-1 px-4 py-3">
        <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
          {value}
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
