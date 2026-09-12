import type { AiInterpreter } from "./index";

// Dev/test-only stand-in for a real AI provider (e.g. Anthropic/OpenAI).
// Deliberately NOT a real LLM call: it composes summary/talkingPoints
// purely by combining the evidence it's given, so it's mechanically
// incapable of inventing a finding that isn't in the input — satisfying
// docs/wibsity-sales-build-spec.md §14's "AI should NOT invent technical
// facts" rule by construction rather than by prompting discipline. When a
// real provider is available, only a new file + one factory branch change.

const CATEGORY_LABEL: Record<string, string> = {
  seo: "SEO",
  mobile: "mobile experience",
  conversion: "conversion path",
  technical: "technical setup",
};

export const mockAiInterpreter: AiInterpreter = {
  async interpret(evidence) {
    if (!evidence.reachable) {
      return {
        summary: "The audit could not reliably measure this site because it could not be reached.",
        talkingPoints: [],
      };
    }

    const failed = evidence.findings.filter((finding) => !finding.passed);

    if (failed.length === 0) {
      return {
        summary: "The audit found no significant issues across the checks it ran.",
        talkingPoints: [],
      };
    }

    const byCategory = new Map<string, number>();
    for (const finding of failed) {
      byCategory.set(finding.category, (byCategory.get(finding.category) ?? 0) + 1);
    }

    const categorySummary = Array.from(byCategory.entries())
      .map(([category, count]) => `${count} issue${count > 1 ? "s" : ""} in ${CATEGORY_LABEL[category] ?? category}`)
      .join(", ");

    const summary = `The audit found ${failed.length} issue${failed.length > 1 ? "s" : ""}: ${categorySummary}.`;

    const talkingPoints = failed
      .slice()
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((finding) => finding.description);

    return { summary, talkingPoints };
  },
};
