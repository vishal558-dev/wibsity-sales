import assert from "node:assert";
import { mockAiInterpreter } from "./mock";
import type { AuditEvidence, CheckFinding } from "@/types/audit";

function finding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    category: "seo",
    points: 30,
    passed: false,
    title: "Missing title",
    description: "No <title> tag was found.",
    evidence: null,
    ...overrides,
  };
}

async function main() {
  const unreachable: AuditEvidence = { reachable: false, categoryScores: null, findings: [] };
  const unreachableResult = await mockAiInterpreter.interpret(unreachable);
  assert.ok(unreachableResult.summary.toLowerCase().includes("could not"));
  assert.deepStrictEqual(unreachableResult.talkingPoints, []);

  const clean: AuditEvidence = {
    reachable: true,
    categoryScores: { seo: 100, mobile: 100, conversion: 100 },
    findings: [finding({ passed: true })],
  };
  const cleanResult = await mockAiInterpreter.interpret(clean);
  assert.ok(!cleanResult.summary.toLowerCase().includes("missing title"));

  // Anti-hallucination property: only issues actually present in the
  // evidence are ever mentioned. A passed check's description, and a
  // category never present at all, must never leak into the output.
  const partial: AuditEvidence = {
    reachable: true,
    categoryScores: { seo: 70, mobile: 100, conversion: 100 },
    findings: [
      finding({ category: "seo", title: "Missing title", description: "No <title> tag was found." }),
      finding({
        category: "seo",
        passed: true,
        title: "Meta description",
        description: "Meta description is fine.",
      }),
    ],
  };
  const partialResult = await mockAiInterpreter.interpret(partial);
  assert.ok(partialResult.talkingPoints.some((point) => point.includes("No <title> tag was found.")));
  assert.ok(!partialResult.summary.includes("Meta description is fine."));
  assert.ok(!partialResult.talkingPoints.some((point) => point.toLowerCase().includes("social")));

  console.log("providers/ai-interpreter/mock.test.ts: all checks passed");
}

main();
