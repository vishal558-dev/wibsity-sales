import Link from "next/link";
import type { LeadRecord } from "@/types/lead";
import { followUpLabel } from "@/lib/crm/followups";
import { LeadScoreBadge } from "@/components/lead-score-badge";
import { LeadStatusBadge } from "@/components/lead-status-badge";
import { EmptyState } from "@/components/empty-state";

function formatLastContact(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function LeadTable({ leads }: { leads: LeadRecord[] }) {
  if (leads.length === 0) {
    return (
      <EmptyState
        title="No leads match these filters"
        description="Try clearing search or filters."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-4 py-2 font-medium">Business</th>
            <th className="px-4 py-2 font-medium">Location</th>
            <th className="px-4 py-2 font-medium">Industry</th>
            <th className="px-4 py-2 font-medium">Score</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Last contact</th>
            <th className="px-4 py-2 font-medium">Next action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {leads.map((lead) => (
            <tr key={lead.id} className="hover:bg-accent">
              <td className="px-4 py-2">
                <Link
                  href={`/leads/${lead.id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {lead.business_name}
                </Link>
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {[lead.city, lead.state].filter(Boolean).join(", ") || "—"}
              </td>
              <td className="px-4 py-2 text-muted-foreground">{lead.industry ?? "—"}</td>
              <td className="px-4 py-2">
                <LeadScoreBadge score={lead.score} category={lead.score_category} />
              </td>
              <td className="px-4 py-2">
                <LeadStatusBadge stage={lead.pipeline_stage} />
              </td>
              <td className="px-4 py-2 font-mono text-muted-foreground">
                {formatLastContact(lead.last_contacted_at)}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {followUpLabel(lead.next_followup_at) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
