import type { CategoryScores, CheckFinding, IssueSeverity } from "@/types/audit";

const SCORED_CATEGORIES = ["seo", "mobile", "conversion"] as const;

// Each scored category starts at 100 and loses its failed checks' points,
// floored at 0. "technical"-category findings (e.g. HTTPS) never affect
// any category score — they're recorded as issues but not scored.
export function computeCategoryScores(findings: CheckFinding[]): CategoryScores {
  const scores: CategoryScores = { seo: 100, mobile: 100, conversion: 100 };
  for (const finding of findings) {
    if (finding.passed) continue;
    if (finding.category !== "seo" && finding.category !== "mobile" && finding.category !== "conversion") continue;
    scores[finding.category] = Math.max(0, scores[finding.category] - finding.points);
  }
  return scores;
}

// Performance is deliberately not part of CategoryScores this phase (no
// headless browser/API — see the design spec) and is never included here;
// Overall is the plain average of seo/mobile/conversion.
export function computeOverallScore(scores: CategoryScores): number {
  const values = SCORED_CATEGORIES.map((category) => scores[category]);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

// Mirrors the point value of the check that produced the issue, so
// severity is never a separate judgment to keep in sync with what
// actually moved the score.
export function severityForPoints(points: number): IssueSeverity {
  if (points >= 30) return "high";
  if (points >= 15) return "medium";
  return "low";
}
