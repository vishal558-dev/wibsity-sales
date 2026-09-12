import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryScores, CheckFinding, WebsiteAudit } from "@/types/audit";
import { severityForPoints } from "./score";

export async function getAudit(supabase: SupabaseClient, auditId: string): Promise<WebsiteAudit | null> {
  const { data } = await supabase.from("website_audits").select("*").eq("id", auditId).maybeSingle();
  return data as WebsiteAudit | null;
}

export async function markAuditProcessing(supabase: SupabaseClient, auditId: string): Promise<void> {
  await supabase.from("website_audits").update({ status: "processing" }).eq("id", auditId);
}

export async function markAuditCompleted(
  supabase: SupabaseClient,
  auditId: string,
  scores: CategoryScores | null,
  overallScore: number | null,
  summary: string,
  talkingPoints: string[] = [],
): Promise<void> {
  await supabase
    .from("website_audits")
    .update({
      status: "completed",
      overall_score: overallScore,
      performance_score: null,
      mobile_score: scores?.mobile ?? null,
      seo_score: scores?.seo ?? null,
      conversion_score: scores?.conversion ?? null,
      summary,
      raw_results: { talking_points: talkingPoints },
    })
    .eq("id", auditId);
}

export async function markAuditFailed(supabase: SupabaseClient, auditId: string, errorMessage: string): Promise<void> {
  await supabase.from("website_audits").update({ status: "failed", error: errorMessage }).eq("id", auditId);
}

// Replaces rather than accumulates: an audit is a single atomic
// fetch-and-check, not a resumable multi-item loop (contrast with Phase
// 3's generation_results, where already-resolved rows are never touched
// again). Deleting first means a re-run (Retry, or any resend) always
// leaves audit_issues matching exactly what that run found — never a
// duplicated pile from an earlier attempt.
export async function saveIssues(supabase: SupabaseClient, auditId: string, findings: CheckFinding[]): Promise<void> {
  await supabase.from("audit_issues").delete().eq("audit_id", auditId);

  const failed = findings.filter((finding) => !finding.passed);
  if (failed.length === 0) return;

  await supabase.from("audit_issues").insert(
    failed.map((finding) => ({
      audit_id: auditId,
      category: finding.category,
      severity: severityForPoints(finding.points),
      title: finding.title,
      description: finding.description,
      evidence: finding.evidence,
    })),
  );
}
