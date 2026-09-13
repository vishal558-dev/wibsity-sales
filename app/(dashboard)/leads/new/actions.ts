"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionOrganizationId } from "@/lib/supabase/session";
import { inngest } from "@/lib/inngest/client";
import { generationFormSchema } from "@/lib/lead-gen/schemas";

export interface GenerationFormState {
  error: string | null;
  fieldErrors: Record<string, string[] | undefined>;
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

  const organizationId = await getSessionOrganizationId();
  if (!organizationId) {
    return { error: "Your account isn't fully set up yet. Contact an admin.", fieldErrors: {} };
  }

  const supabase = await createClient();
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
  const organizationId = await getSessionOrganizationId();
  if (!organizationId) return;

  const supabase = await createClient();
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
