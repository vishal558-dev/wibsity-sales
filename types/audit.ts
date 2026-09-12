export type AuditStatus = "pending" | "processing" | "completed" | "failed";
export type AuditCategory = "seo" | "mobile" | "conversion" | "technical";
export type IssueSeverity = "high" | "medium" | "low";

export interface WebsiteAudit {
  id: string;
  lead_id: string;
  status: AuditStatus;
  overall_score: number | null;
  performance_score: number | null;
  mobile_score: number | null;
  seo_score: number | null;
  conversion_score: number | null;
  summary: string | null;
  raw_results: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditIssue {
  id: string;
  audit_id: string;
  category: AuditCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  evidence: Record<string, unknown> | null;
  created_at: string;
}

// One check's outcome, before any of it becomes a persisted AuditIssue row.
// `points` is how much the check deducts from its category score if failed
// (technical-category findings carry a points value too, for severity
// classification only — they never affect a category score).
export interface CheckFinding {
  category: AuditCategory;
  points: number;
  passed: boolean;
  title: string;
  description: string;
  evidence: Record<string, unknown> | null;
}

export interface CategoryScores {
  seo: number;
  mobile: number;
  conversion: number;
}

export interface AuditEvidence {
  reachable: boolean;
  categoryScores: CategoryScores | null;
  findings: CheckFinding[];
}

export interface AiInterpretation {
  summary: string;
  talkingPoints: string[];
}
