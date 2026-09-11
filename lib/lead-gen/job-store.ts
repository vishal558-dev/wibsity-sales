import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationJob, GenerationJobCounters, GenerationResult, RawBusiness } from "@/types/generation";

const RESULT_COLUMNS = "id, generation_job_id, external_id, business_name, raw_data, status, lead_id, created_at";

export async function getJob(supabase: SupabaseClient, jobId: string): Promise<GenerationJob | null> {
  const { data } = await supabase.from("generation_jobs").select("*").eq("id", jobId).maybeSingle();
  return data as GenerationJob | null;
}

export async function markJobProcessing(supabase: SupabaseClient, jobId: string): Promise<void> {
  await supabase.from("generation_jobs").update({ status: "processing" }).eq("id", jobId);
}

export async function markJobCompleted(
  supabase: SupabaseClient,
  jobId: string,
  counters: GenerationJobCounters,
): Promise<void> {
  await supabase
    .from("generation_jobs")
    .update({ ...counters, status: "completed", completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string,
  counters: GenerationJobCounters,
): Promise<void> {
  await supabase
    .from("generation_jobs")
    .update({ ...counters, status: "failed", error: errorMessage })
    .eq("id", jobId);
}

export async function getResultsForJob(supabase: SupabaseClient, jobId: string): Promise<GenerationResult[]> {
  const { data } = await supabase.from("generation_results").select(RESULT_COLUMNS).eq("generation_job_id", jobId);
  return (data ?? []) as unknown as GenerationResult[];
}

export async function getPendingResults(supabase: SupabaseClient, jobId: string): Promise<GenerationResult[]> {
  const { data } = await supabase
    .from("generation_results")
    .select(RESULT_COLUMNS)
    .eq("generation_job_id", jobId)
    .eq("status", "pending");
  return (data ?? []) as unknown as GenerationResult[];
}

export async function insertPendingResults(
  supabase: SupabaseClient,
  jobId: string,
  businesses: RawBusiness[],
): Promise<void> {
  if (businesses.length === 0) return;
  const { error } = await supabase.from("generation_results").insert(
    businesses.map((business) => ({
      generation_job_id: jobId,
      external_id: business.external_id,
      business_name: business.name,
      raw_data: business,
      status: "pending",
    })),
  );
  if (error) throw new Error(`Failed to save discovered businesses: ${error.message}`);
}

export async function markResultCreated(supabase: SupabaseClient, resultId: string, leadId: string): Promise<void> {
  await supabase.from("generation_results").update({ status: "created", lead_id: leadId }).eq("id", resultId);
}

export async function markResultFiltered(supabase: SupabaseClient, resultId: string): Promise<void> {
  await supabase.from("generation_results").update({ status: "filtered" }).eq("id", resultId);
}

export async function markResultDuplicate(
  supabase: SupabaseClient,
  resultId: string,
  matchedLeadId: string,
): Promise<void> {
  await supabase.from("generation_results").update({ status: "duplicate", lead_id: matchedLeadId }).eq("id", resultId);
}

// Recomputed from current row states rather than incremented, so this is
// safe to call any number of times across retries/resumed runs without
// double-counting anything.
export async function recomputeJobCounters(supabase: SupabaseClient, jobId: string): Promise<GenerationJobCounters> {
  const { data } = await supabase.from("generation_results").select("status").eq("generation_job_id", jobId);

  const rows = (data ?? []) as Array<{ status: string }>;
  const found = rows.length;
  const analyzed = rows.filter((r) => r.status !== "pending").length;
  const qualified = rows.filter((r) => r.status === "created").length;
  const duplicate = rows.filter((r) => r.status === "duplicate").length;
  const progress = found > 0 ? Math.round((analyzed / found) * 100) : 0;

  const counters: GenerationJobCounters = {
    found_count: found,
    analyzed_count: analyzed,
    qualified_count: qualified,
    duplicate_count: duplicate,
    progress,
  };

  await supabase.from("generation_jobs").update(counters).eq("id", jobId);

  return counters;
}
