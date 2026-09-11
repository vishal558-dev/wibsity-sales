import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLeadById, getNotesForLead } from "@/lib/crm/leads";
import { getActivitiesForLead } from "@/lib/crm/activities";
import { LeadDetailHeader } from "@/components/leads/lead-detail-header";
import { ContactInfoCard } from "@/components/leads/contact-info-card";
import { LeadNotes } from "@/components/leads/lead-notes";
import { ActivityTimeline } from "@/components/leads/activity-timeline";
import { FollowUpCard } from "@/components/leads/follow-up-card";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user!.id)
    .single();

  const lead = await getLeadById(supabase, profile!.organization_id, id);
  if (!lead) notFound();

  const notes = await getNotesForLead(supabase, lead.id);
  const activities = await getActivitiesForLead(supabase, lead.id);

  return (
    <>
      <LeadDetailHeader lead={lead} />
      <ContactInfoCard lead={lead} />
      <FollowUpCard leadId={lead.id} nextFollowupAt={lead.next_followup_at} />
      <LeadNotes leadId={lead.id} notes={notes} />
      <ActivityTimeline activities={activities} />
    </>
  );
}
