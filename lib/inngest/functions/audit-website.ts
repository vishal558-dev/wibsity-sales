import { NonRetriableError } from "inngest";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createActivity } from "@/lib/crm/activities";
import { computeAndStoreScore } from "@/lib/scoring/apply-score";
import { fetchAndCheckWebsite } from "@/lib/audits/fetch-website";
import { computeCategoryScores, computeOverallScore } from "@/lib/audits/score";
import { getAiInterpreter } from "@/providers/ai-interpreter";
import { getAudit, markAuditProcessing, markAuditCompleted, markAuditFailed, saveIssues } from "@/lib/audits/job-store";

export const auditWebsite = inngest.createFunction(
  {
    id: "audit-website",
    triggers: { event: "audits/website.requested" },
    // No event-level idempotency key — see lib/inngest/functions/generate-leads.ts's
    // comment for why: a legitimate retry resends this same auditId, and
    // Inngest's idempotency dedup would silently drop that resend.
    onFailure: async ({ event, error }) => {
      const auditId = (event.data.event.data as { auditId: string }).auditId;
      const supabase = createAdminClient();
      await markAuditFailed(supabase, auditId, error.message);
    },
  },
  async ({ event, step }) => {
    const { auditId } = event.data as { auditId: string };
    const supabase = createAdminClient();

    const audit = await step.run("load-audit", () => getAudit(supabase, auditId));
    if (!audit) throw new NonRetriableError(`website_audits row ${auditId} not found`);

    const lead = await step.run("load-lead", async () => {
      const { data } = await supabase.from("leads").select("id, website").eq("id", audit.lead_id).maybeSingle();
      return data as { id: string; website: string | null } | null;
    });
    if (!lead?.website) throw new NonRetriableError(`Lead ${audit.lead_id} has no website to audit`);

    await step.run("mark-processing", () => markAuditProcessing(supabase, auditId));

    const fetchResult = await step.run("fetch-and-check", () => fetchAndCheckWebsite(lead.website!));

    if (!fetchResult.reachable) {
      await step.run("save-unreachable", async () => {
        await saveIssues(supabase, auditId, []);
        await markAuditCompleted(supabase, auditId, null, null, fetchResult.error ?? "The site could not be reached.");
      });
      await step.run("update-lead-score", () => computeAndStoreScore(supabase, audit.lead_id));
      await step.run("log-activity", () => createActivity(supabase, audit.lead_id, "audited", "Website audited"));
      return { reachable: false };
    }

    const scores = await step.run("compute-scores", () => computeCategoryScores(fetchResult.findings));
    const overall = await step.run("compute-overall", () => computeOverallScore(scores));

    const interpretation = await step.run("interpret", () => {
      const interpreter = getAiInterpreter();
      return interpreter.interpret({ reachable: true, categoryScores: scores, findings: fetchResult.findings });
    });

    await step.run("save-issues", () => saveIssues(supabase, auditId, fetchResult.findings));
    await step.run("mark-completed", () =>
      markAuditCompleted(supabase, auditId, scores, overall, interpretation.summary, interpretation.talkingPoints),
    );
    await step.run("update-lead-score", () => computeAndStoreScore(supabase, audit.lead_id));
    await step.run("log-activity", () => createActivity(supabase, audit.lead_id, "audited", "Website audited"));

    return { reachable: true, overall };
  },
);
