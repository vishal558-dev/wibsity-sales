import Link from "next/link";
import type { Lead } from "@/types/lead";
import { LeadScoreBadge } from "@/components/lead-score-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

function followUpLabel(nextFollowupAt: string | null) {
  if (!nextFollowupAt) return null;

  const due = new Date(nextFollowupAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const daysDiff = Math.round((today.getTime() - due.getTime()) / 86_400_000);

  if (daysDiff > 0) return `${daysDiff} day${daysDiff === 1 ? "" : "s"} overdue`;
  if (daysDiff === 0) return "Follow up today";
  return "Follow up scheduled";
}

export function LeadActionList({
  leads,
  emptyMessage,
  showFollowUp = false,
}: {
  leads: Lead[];
  emptyMessage: string;
  showFollowUp?: boolean;
}) {
  if (leads.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {leads.map((lead) => (
        <li key={lead.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {lead.business_name}
            </span>
            <span className="text-sm text-muted-foreground">
              {[lead.city, lead.state].filter(Boolean).join(", ")}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <LeadScoreBadge score={lead.score} category={lead.score_category} />
            {showFollowUp && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {followUpLabel(lead.next_followup_at)}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href={`/leads/${lead.id}`} />}
            >
              Open lead
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
