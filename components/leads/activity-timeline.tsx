import type { LeadActivity } from "@/types/lead";
import { EmptyState } from "@/components/empty-state";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function ActivityTimeline({ activities }: { activities: LeadActivity[] }) {
  if (activities.length === 0) {
    return <EmptyState title="No activity yet" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">ACTIVITY</h2>
      <ul className="flex flex-col gap-3">
        {activities.map((activity) => (
          <li key={activity.id} className="flex items-baseline gap-3 text-sm">
            <span className="font-mono text-muted-foreground">{formatDate(activity.created_at)}</span>
            <span className="text-foreground">{activity.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
