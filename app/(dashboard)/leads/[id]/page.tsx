import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionOrganizationId } from "@/lib/supabase/session";
import { getLeadById, getNotesForLead } from "@/lib/crm/leads";
import { getActivitiesForLead } from "@/lib/crm/activities";
import { getLatestAuditForLead } from "@/lib/audits/queries";
import { loadScoreInput } from "@/lib/scoring/apply-score";
import { calculateScore } from "@/lib/scoring/calculate-score";
import { LeadDetailHeader } from "@/components/leads/lead-detail-header";
import { ContactInfoCard } from "@/components/leads/contact-info-card";
import { AuditCard } from "@/components/leads/audit-card";
import { ScoreBreakdownCard } from "@/components/leads/score-breakdown-card";
import { LeadNotes } from "@/components/leads/lead-notes";
import { ActivityTimeline } from "@/components/leads/activity-timeline";
import { FollowUpCard } from "@/components/leads/follow-up-card";
import { NoOrganizationState } from "@/components/no-organization-state";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizationId = await getSessionOrganizationId();

  if (!organizationId) {
    return <NoOrganizationState />;
  }

  const supabase = await createClient();
  const lead = await getLeadById(supabase, organizationId, id);
  if (!lead) notFound();

  const notes = await getNotesForLead(supabase, lead.id);
  const activities = await getActivitiesForLead(supabase, lead.id);
  const audit = await getLatestAuditForLead(supabase, lead.id);
  const scoreInput = await loadScoreInput(supabase, lead);
  const scoreBreakdown = calculateScore(scoreInput);

  return (
    <>
      <LeadDetailHeader lead={lead} />
      <ContactInfoCard lead={lead} />
      <AuditCard leadId={lead.id} website={lead.website} audit={audit} />
      <ScoreBreakdownCard leadId={lead.id} breakdown={scoreBreakdown} />
      <FollowUpCard leadId={lead.id} nextFollowupAt={lead.next_followup_at} />
      <LeadNotes leadId={lead.id} notes={notes} />
      <ActivityTimeline activities={activities} />
    </>
  );
}
