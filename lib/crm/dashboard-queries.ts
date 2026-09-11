import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, LeadActivity } from "@/types/lead";

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

export interface KpiCounts {
  hotLeads: number;
  warmLeads: number;
  followUpsDue: number;
  replies: number;
  demosAndMeetings: number;
}

export async function getKpiCounts(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<KpiCounts> {
  const [hot, warm, followUpsDue, stageCounts] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("score_category", "HOT"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("score_category", "WARM"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .lte("next_followup_at", endOfToday()),
    supabase
      .from("leads")
      .select("id, pipeline_stage:pipeline_stages(slug)")
      .eq("organization_id", organizationId),
  ]);

  const stages = (stageCounts.data ?? []) as unknown as Array<{
    pipeline_stage: { slug: string } | null;
  }>;
  const replies = stages.filter((l) => l.pipeline_stage?.slug === "replied").length;
  const demosAndMeetings = stages.filter(
    (l) => l.pipeline_stage?.slug === "demo_sent" || l.pipeline_stage?.slug === "meeting",
  ).length;

  return {
    hotLeads: hot.count ?? 0,
    warmLeads: warm.count ?? 0,
    followUpsDue: followUpsDue.count ?? 0,
    replies,
    demosAndMeetings,
  };
}

export async function getTodaysActions(
  supabase: SupabaseClient,
  organizationId: string,
  limit = 5,
): Promise<Lead[]> {
  const { data } = await supabase
    .from("leads")
    .select(
      "id, business_name, city, state, score, score_category, last_contacted_at, next_followup_at",
    )
    .eq("organization_id", organizationId)
    .lte("next_followup_at", endOfToday())
    .order("next_followup_at", { ascending: true })
    .limit(limit);

  return (data ?? []) as Lead[];
}

export async function getPriorityLeads(
  supabase: SupabaseClient,
  organizationId: string,
  limit = 5,
): Promise<Lead[]> {
  const { data } = await supabase
    .from("leads")
    .select(
      "id, business_name, city, state, score, score_category, last_contacted_at, next_followup_at",
    )
    .eq("organization_id", organizationId)
    .is("last_contacted_at", null)
    .order("score", { ascending: false })
    .limit(limit);

  return (data ?? []) as Lead[];
}

export async function getRecentActivity(
  supabase: SupabaseClient,
  organizationId: string,
  limit = 8,
): Promise<LeadActivity[]> {
  const { data } = await supabase
    .from("lead_activities")
    .select("id, lead_id, type, description, created_at, lead:leads!inner(business_name, organization_id)")
    .eq("lead.organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as unknown as LeadActivity[];
}

// Used by the dashboard header to distinguish a brand-new org (no seed data
// run yet) from one that genuinely has zero leads matching a section's filter.
export async function getHasAnyLeads(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  return (count ?? 0) > 0;
}
