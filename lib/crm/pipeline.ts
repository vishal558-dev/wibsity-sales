import type { SupabaseClient } from "@supabase/supabase-js";
import { createActivity } from "@/lib/crm/activities";
import type { PipelineStage } from "@/types/pipeline";
import type { LeadRecord } from "@/types/lead";

const LEAD_COLUMNS =
  "id, business_name, website, phone, email, industry, city, state, country, rating, review_count, source, score, score_category, pipeline_stage_id, last_contacted_at, next_followup_at, created_at";

export async function getPipelineStages(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<PipelineStage[]> {
  const { data } = await supabase
    .from("pipeline_stages")
    .select("id, organization_id, name, slug, position")
    .eq("organization_id", organizationId)
    .order("position", { ascending: true });

  return (data ?? []) as PipelineStage[];
}

export async function getPipelineLeads(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<LeadRecord[]> {
  const { data } = await supabase
    .from("leads")
    .select(`${LEAD_COLUMNS}, pipeline_stage:pipeline_stages(id, name, slug)`)
    .eq("organization_id", organizationId)
    .not("pipeline_stage_id", "is", null);

  return (data ?? []) as unknown as LeadRecord[];
}

export async function updateLeadPipelineStage(
  supabase: SupabaseClient,
  leadId: string,
  newStage: { id: string; name: string },
): Promise<void> {
  await supabase.from("leads").update({ pipeline_stage_id: newStage.id }).eq("id", leadId);
  await createActivity(supabase, leadId, "status_changed", `Moved to ${newStage.name}`);
}
