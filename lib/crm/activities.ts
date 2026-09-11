import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadActivity } from "@/types/lead";

export async function createActivity(
  supabase: SupabaseClient,
  leadId: string,
  type: string,
  description: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await supabase.from("lead_activities").insert({
    lead_id: leadId,
    type,
    description,
    metadata: metadata ?? null,
  });
}

export async function getActivitiesForLead(
  supabase: SupabaseClient,
  leadId: string,
): Promise<LeadActivity[]> {
  const { data } = await supabase
    .from("lead_activities")
    .select("id, lead_id, type, description, created_at, lead:leads(business_name)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as LeadActivity[];
}
