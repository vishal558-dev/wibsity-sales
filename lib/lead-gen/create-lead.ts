import type { SupabaseClient } from "@supabase/supabase-js";
import { createActivity } from "@/lib/crm/activities";
import { computeAndStoreScore } from "@/lib/scoring/apply-score";
import type { RawBusiness } from "@/types/generation";

// Called only from the org-scoped Inngest pipeline (lib/inngest/functions/):
// organizationId is the job's own organization_id, loaded once by the
// caller — never trust a caller-supplied org id from anywhere else.
export async function createLeadFromBusiness(
  supabase: SupabaseClient,
  organizationId: string,
  provider: string,
  business: RawBusiness,
  pipelineStageId: string | null,
  generationJobId: string,
): Promise<string> {
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      business_name: business.name,
      website: business.website,
      phone: business.phone,
      email: business.email,
      industry: business.industry,
      city: business.city,
      state: business.state,
      country: business.country,
      rating: business.rating,
      review_count: business.review_count,
      source: provider,
      source_url: business.source_url,
      pipeline_stage_id: pipelineStageId,
    })
    .select("id")
    .single();

  if (error || !lead) {
    throw new Error(`Failed to create lead for "${business.name}": ${error?.message ?? "unknown error"}`);
  }

  await supabase.from("lead_sources").insert({
    lead_id: lead.id,
    provider,
    external_id: business.external_id,
    source_url: business.source_url,
    raw_data: business,
  });

  await createActivity(supabase, lead.id, "created", "Lead created from generation", {
    generation_job_id: generationJobId,
  });

  await computeAndStoreScore(supabase, lead.id as string);

  return lead.id as string;
}
