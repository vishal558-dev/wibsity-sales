import type { SupabaseClient } from "@supabase/supabase-js";
import { createActivity } from "@/lib/crm/activities";
import type { LeadFilters, LeadFilterOptions, LeadNote, LeadRecord } from "@/types/lead";

const LEAD_COLUMNS =
  "id, business_name, website, phone, email, industry, city, state, country, rating, review_count, source, score, score_category, pipeline_stage_id, last_contacted_at, next_followup_at, created_at";

// Postgrest's .or() filter string treats "," and "()" as syntax. This is a
// free-text search box on an internal tool, not a field that needs those
// characters, so strip them rather than implement full DSL escaping.
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()]/g, "").trim();
}

export async function getLeads(
  supabase: SupabaseClient,
  organizationId: string,
  filters: LeadFilters,
): Promise<LeadRecord[]> {
  const stageJoin = filters.stageSlug ? "pipeline_stages!inner" : "pipeline_stages";
  let query = supabase
    .from("leads")
    .select(`${LEAD_COLUMNS}, pipeline_stage:${stageJoin}(id, name, slug)`)
    .eq("organization_id", organizationId);

  if (filters.search) {
    const term = sanitizeSearchTerm(filters.search);
    if (term) {
      query = query.or(
        `business_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,website.ilike.%${term}%,city.ilike.%${term}%,industry.ilike.%${term}%`,
      );
    }
  }
  if (filters.scoreCategory) query = query.eq("score_category", filters.scoreCategory);
  if (filters.stageSlug) query = query.eq("pipeline_stage.slug", filters.stageSlug);
  if (filters.industry) query = query.eq("industry", filters.industry);
  if (filters.city) query = query.eq("city", filters.city);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.hasWebsite) query = query.not("website", "is", null);
  if (filters.hasPhone) query = query.not("phone", "is", null);
  if (filters.hasEmail) query = query.not("email", "is", null);
  if (filters.followUpDue) query = query.lte("next_followup_at", new Date().toISOString());

  const { data } = await query.order("score", { ascending: false, nullsFirst: false });
  return (data ?? []) as unknown as LeadRecord[];
}

export async function getLeadFilterOptions(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<LeadFilterOptions> {
  const { data } = await supabase
    .from("leads")
    .select("industry, city, source")
    .eq("organization_id", organizationId);

  const rows = (data ?? []) as Array<{
    industry: string | null;
    city: string | null;
    source: string | null;
  }>;
  const unique = (values: (string | null)[]) =>
    Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort();

  return {
    industries: unique(rows.map((r) => r.industry)),
    cities: unique(rows.map((r) => r.city)),
    sources: unique(rows.map((r) => r.source)),
  };
}

export async function getLeadById(
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
): Promise<LeadRecord | null> {
  const { data } = await supabase
    .from("leads")
    .select(`${LEAD_COLUMNS}, pipeline_stage:pipeline_stages(id, name, slug)`)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  return data as unknown as LeadRecord | null;
}

export async function getNotesForLead(
  supabase: SupabaseClient,
  leadId: string,
): Promise<LeadNote[]> {
  const { data } = await supabase
    .from("lead_notes")
    .select("id, lead_id, content, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  return (data ?? []) as LeadNote[];
}

export async function addNote(
  supabase: SupabaseClient,
  leadId: string,
  content: string,
): Promise<void> {
  await supabase.from("lead_notes").insert({ lead_id: leadId, content });
  await createActivity(supabase, leadId, "note", "Added a note");
}
