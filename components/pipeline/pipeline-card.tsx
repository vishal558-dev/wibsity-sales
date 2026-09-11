import Link from "next/link";
import type { LeadRecord } from "@/types/lead";
import { LeadScoreBadge } from "@/components/lead-score-badge";
import { followUpLabel } from "@/lib/crm/followups";

export function PipelineCard({ lead }: { lead: LeadRecord }) {
  const label = followUpLabel(lead.next_followup_at);

  return (
    <Link
      href={`/leads/${lead.id}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 hover:border-foreground/30"
    >
      <span className="text-sm font-medium text-foreground">{lead.business_name}</span>
      <div className="flex items-center justify-between">
        <LeadScoreBadge score={lead.score} category={lead.score_category} />
        <span className="text-sm text-muted-foreground">{lead.city}</span>
      </div>
      {label && <span className="text-sm text-muted-foreground">Next: {label}</span>}
    </Link>
  );
}
