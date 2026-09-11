"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { generationFormSchema } from "@/lib/lead-gen/schemas";

export interface GenerationFormState {
  error: string | null;
  fieldErrors: Record<string, string[] | undefined>;
}

// A signed-in user's organization_id, derived from their session — never
// trust an organization id supplied by the client itself.
async function getSessionOrganizationId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user!.id)
    .single();
  return profile!.organization_id as string;
}

export async function submitGenerationAction(
  _prevState: GenerationFormState,
  formData: FormData,
): Promise<GenerationFormState> {
  const parsed = generationFormSchema.safeParse({
    industry: formData.get("industry"),
    location: formData.get("location"),
    requestedCount: formData.get("requestedCount"),
    minRating: formData.get("minRating") || undefined,
    websiteRequired: formData.get("websiteRequired"),
    phoneRequired: formData.get("phoneRequired"),
  });

  if (!parsed.success) {
    return { error: null, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const organizationId = await getSessionOrganizationId(supabase);
  const input = parsed.data;

  const { data: job, error } = await supabase
    .from("generation_jobs")
    .insert({
      organization_id: organizationId,
      industry: input.industry,
      location: input.location,
      requested_count: input.requestedCount,
      min_rating: input.minRating ?? null,
      website_required: input.websiteRequired,
      phone_required: input.phoneRequired,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !job) {
    return { error: "Could not start lead generation. Please try again.", fieldErrors: {} };
  }

  await inngest.send({ name: "leadgen/job.created", data: { jobId: job.id } });

  redirect(`/leads/new?job=${job.id}`);
}

export async function retryGenerationAction(jobId: string): Promise<void> {
  const supabase = await createClient();
  const organizationId = await getSessionOrganizationId(supabase);

  const { data: job } = await supabase
    .from("generation_jobs")
    .select("id, status")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .single();

  if (!job || job.status !== "failed") return;

  await supabase.from("generation_jobs").update({ status: "pending", error: null }).eq("id", jobId);
  await inngest.send({ name: "leadgen/job.created", data: { jobId } });
}
