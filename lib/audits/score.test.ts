import assert from "node:assert";
import { computeCategoryScores, computeOverallScore, severityForPoints } from "./score";
import type { CheckFinding } from "@/types/audit";

function finding(overrides: Partial<CheckFinding> = {}): CheckFinding {
  return {
    category: "seo",
    points: 30,
    passed: false,
    title: "Test",
    description: "Test",
    evidence: null,
    ...overrides,
  };
}

assert.deepStrictEqual(
  computeCategoryScores([
    finding({ category: "seo", passed: true }),
    finding({ category: "mobile", passed: true }),
    finding({ category: "conversion", passed: true }),
  ]),
  { seo: 100, mobile: 100, conversion: 100 },
);

// Multiple failures in one category floor at 0, never negative.
assert.deepStrictEqual(
  computeCategoryScores([
    finding({ category: "seo", points: 30, passed: false }),
    finding({ category: "seo", points: 25, passed: false }),
    finding({ category: "seo", points: 20, passed: false }),
    finding({ category: "seo", points: 25, passed: false }),
  ]),
  { seo: 0, mobile: 100, conversion: 100 },
);

// technical-category findings never affect any scored category.
assert.deepStrictEqual(
  computeCategoryScores([finding({ category: "technical", points: 30, passed: false })]),
  { seo: 100, mobile: 100, conversion: 100 },
);

assert.strictEqual(computeOverallScore({ seo: 90, mobile: 100, conversion: 80 }), 90);
assert.strictEqual(computeOverallScore({ seo: 0, mobile: 0, conversion: 0 }), 0);

assert.strictEqual(severityForPoints(40), "high");
assert.strictEqual(severityForPoints(30), "high");
assert.strictEqual(severityForPoints(25), "medium");
assert.strictEqual(severityForPoints(15), "medium");
assert.strictEqual(severityForPoints(10), "low");

console.log("lib/audits/score.test.ts: all checks passed");
