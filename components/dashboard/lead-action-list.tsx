import Link from "next/link";
import type { Lead } from "@/types/lead";
import { LeadScoreBadge } from "@/components/lead-score-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { followUpLabel } from "@/lib/crm/followups";

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
