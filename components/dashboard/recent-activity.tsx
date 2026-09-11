import type { LeadActivity } from "@/types/lead";
import { EmptyState } from "@/components/empty-state";

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

export function RecentActivity({ activities }: { activities: LeadActivity[] }) {
  if (activities.length === 0) {
    return <EmptyState title="No activity yet" />;
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {activities.map((activity) => (
        <li key={activity.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm text-foreground">{activity.description}</span>
            <span className="text-sm text-muted-foreground">
              {activity.lead?.business_name}
            </span>
          </div>
          <span className="shrink-0 font-mono text-sm text-muted-foreground">
            {formatTimestamp(activity.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}
