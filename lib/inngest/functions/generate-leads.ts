import { NonRetriableError } from "inngest";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessSearchProvider } from "@/providers/business-search";
import { passesFilters } from "@/lib/lead-gen/qualify";
import { findDuplicateLeadId } from "@/lib/lead-gen/deduplicate";
import { createLeadFromBusiness } from "@/lib/lead-gen/create-lead";
import { getPipelineStages } from "@/lib/crm/pipeline";
import {
  getJob,
  getResultsForJob,
  getPendingResults,
  insertPendingResults,
  markJobProcessing,
  markJobCompleted,
  markJobFailed,
  markResultCreated,
  markResultFiltered,
  markResultDuplicate,
  recomputeJobCounters,
} from "@/lib/lead-gen/job-store";

const PROVIDER_NAME = "mock";

export const generateLeads = inngest.createFunction(
  {
    id: "generate-leads",
    triggers: { event: "leadgen/job.created" },
    // No event-level idempotency key: retries intentionally re-send this
    // event with the same jobId, and Inngest's idempotency dedup (a ~24h
    // window) would silently drop that resend and never start a new run.
    // Safety against duplicate/concurrent processing already comes from
    // each step below only ever touching still-'pending' rows.
    //
    // Runs once Inngest's own retries are exhausted. Does NOT roll back
    // anything already-created steps did — partial success (leads already
    // created) is preserved, only the job's own status/counters are set.
    onFailure: async ({ event, error }) => {
      const jobId = (event.data.event.data as { jobId: string }).jobId;
      const supabase = createAdminClient();
      const counters = await recomputeJobCounters(supabase, jobId);
      await markJobFailed(supabase, jobId, error.message, counters);
    },
  },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string };
    const supabase = createAdminClient();

    const job = await step.run("load-job", () => getJob(supabase, jobId));
    if (!job) throw new NonRetriableError(`generation_jobs row ${jobId} not found`);

    await step.run("mark-processing", () => markJobProcessing(supabase, jobId));

    // Resumability: if results already exist for this job (a resumed or
    // retried run — not necessarily the same Inngest run), discovery is
    // skipped entirely and we go straight to processing what's left.
    const existingResults = await step.run("check-existing-results", () => getResultsForJob(supabase, jobId));

    if (existingResults.length === 0) {
      const businesses = await step.run("discover", () => {
        const provider = getBusinessSearchProvider();
        return provider.search({
          industry: job.industry,
          location: job.location,
          count: job.requested_count,
        });
      });
      await step.run("save-discovered-results", () => insertPendingResults(supabase, jobId, businesses));
    }

    const newStage = await step.run("load-new-stage", async () => {
      const stages = await getPipelineStages(supabase, job.organization_id);
      return stages.find((stage) => stage.slug === "new") ?? null;
    });

    // Only ever selects rows still 'pending' — already-resolved rows
    // (created/filtered/duplicate) from an earlier attempt are never
    // touched again, which is what makes retries safe.
    const pending = await step.run("load-pending-results", () => getPendingResults(supabase, jobId));

    for (const result of pending) {
      await step.run(`process-result-${result.id}`, async () => {
        const business = result.raw_data;
        const duplicateLeadId = await findDuplicateLeadId(supabase, job.organization_id, PROVIDER_NAME, business);

        if (duplicateLeadId) {
          await markResultDuplicate(supabase, result.id, duplicateLeadId);
          return;
        }

        const qualifies = passesFilters(business, {
          minRating: job.min_rating,
          websiteRequired: job.website_required,
          phoneRequired: job.phone_required,
        });

        if (!qualifies) {
          await markResultFiltered(supabase, result.id);
          return;
        }

        const leadId = await createLeadFromBusiness(
          supabase,
          job.organization_id,
          PROVIDER_NAME,
          business,
          newStage?.id ?? null,
          jobId,
        );
        await markResultCreated(supabase, result.id, leadId);
      });

      await step.run(`recompute-counters-${result.id}`, () => recomputeJobCounters(supabase, jobId));
    }

    const finalCounters = await step.run("finalize-counters", () => recomputeJobCounters(supabase, jobId));
    await step.run("mark-completed", () => markJobCompleted(supabase, jobId, finalCounters));

    return finalCounters;
  },
);
