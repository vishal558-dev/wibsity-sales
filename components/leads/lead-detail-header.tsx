import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LeadRecord } from "@/types/lead";
import { LeadScoreBadge } from "@/components/lead-score-badge";
import { LeadStatusBadge } from "@/components/lead-status-badge";
import { ContactActions } from "@/components/leads/contact-actions";

export function LeadDetailHeader({ lead }: { lead: LeadRecord }) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/leads"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to leads
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{lead.business_name}</h1>
        <p className="text-sm text-muted-foreground">
          {[lead.city, lead.state].filter(Boolean).join(", ")}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <LeadScoreBadge score={lead.score} category={lead.score_category} />
          <LeadStatusBadge stage={lead.pipeline_stage} />
        </div>
      </div>
      <ContactActions lead={lead} />
    </div>
  );
}
