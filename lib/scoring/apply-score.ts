import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateScore } from "./calculate-score";
import type { ScoreInput } from "@/types/scoring";

interface LeadFieldsForScoring {
  id: string;
  rating: number | null;
  review_count: number | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
}

// Takes whatever lead shape the caller already has (a full LeadRecord from
// a page load, or the minimal columns computeAndStoreScore selects below)
// and loads the two extra pieces scoring needs: the latest *completed*
// audit's score (not just the latest audit — a currently-failed retry of a
// previously-successful audit shouldn't erase a known website score) and
// whether the lead has a named contact.
export async function loadScoreInput(supabase: SupabaseClient, lead: LeadFieldsForScoring): Promise<ScoreInput> {
  const { data: audit } = await supabase
    .from("website_audits")
    .select("overall_score")
    .eq("lead_id", lead.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count } = await supabase
    .from("lead_contacts")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", lead.id);

  return {
    rating: lead.rating,
    reviewCount: lead.review_count,
    industry: lead.industry,
    phone: lead.phone,
    email: lead.email,
    hasContact: (count ?? 0) > 0,
    city: lead.city,
    websiteAuditScore: audit ? audit.overall_score : undefined,
  };
}

// The one function every trigger point calls. Works with either a
// session-scoped client (RLS applies) or the service-role admin client
// (the Inngest function) — it does no org-scoping of its own, matching
// every other DB helper in this codebase that takes a SupabaseClient.
export async function computeAndStoreScore(supabase: SupabaseClient, leadId: string): Promise<void> {
  const { data: lead } = await supabase
    .from("leads")
    .select("id, rating, review_count, industry, phone, email, city")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;

  const input = await loadScoreInput(supabase, lead);
  const breakdown = calculateScore(input);

  await supabase
    .from("leads")
    .update({ score: breakdown.overallScore, score_category: breakdown.scoreCategory })
    .eq("id", leadId);
}
