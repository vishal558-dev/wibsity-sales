import assert from "node:assert";
import { calculateScore } from "./calculate-score";
import type { ScoreInput } from "@/types/scoring";

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    rating: null,
    reviewCount: null,
    industry: null,
    phone: null,
    email: null,
    hasContact: false,
    city: null,
    websiteAuditScore: undefined,
    ...overrides,
  };
}

// Missing completed audit -> websiteOpportunity is null, not 0; overall
// score is computed out of the remaining 70 possible points.
{
  const result = calculateScore(input({ websiteAuditScore: undefined }));
  assert.strictEqual(result.websiteOpportunity, null);
  // businessActivity 0 + wibsityFit 0 + contactability 0 + localRelevance 0 + other 0 = 0/70
  assert.strictEqual(result.overallScore, 0);
}

// Audit completed but site unreachable (overall_score null) -> same
// null/"not yet assessed" treatment as no audit at all.
{
  const result = calculateScore(input({ websiteAuditScore: null }));
  assert.strictEqual(result.websiteOpportunity, null);
}

// A completed, measured audit -> websiteOpportunity is a real factor,
// inverted from the audit score, and included in a /100 total.
{
  const result = calculateScore(
    input({ websiteAuditScore: 40, rating: 5, reviewCount: 100, industry: "Solar", phone: "1", email: "a@b.com", hasContact: true, city: "Noida" }),
  );
  assert.deepStrictEqual(result.websiteOpportunity, { points: 18, maxPoints: 30 }); // round((100-40)*0.3) = 18
  assert.strictEqual(result.businessActivity.points, 20); // 12 (rating) + 8 (100+ reviews)
  assert.strictEqual(result.wibsityFit.points, 20); // exact target-industry match
  assert.strictEqual(result.contactability.points, 15); // phone + email + contact
  assert.strictEqual(result.localRelevance.points, 10); // target service area
  assert.strictEqual(result.other.points, 0);
  // earnedPoints = 18+20+20+15+10+0 = 83, possiblePoints = 30+20+20+15+10+5 = 100
  assert.strictEqual(result.overallScore, 83);
}

// Missing contact info -> contactability is 0, not partially credited.
{
  const result = calculateScore(input({ phone: null, email: null, hasContact: false }));
  assert.strictEqual(result.contactability.points, 0);
}

// Unknown/unlisted industry gets partial credit; no industry at all gets none.
{
  assert.strictEqual(calculateScore(input({ industry: "Bakery" })).wibsityFit.points, 8);
  assert.strictEqual(calculateScore(input({ industry: null })).wibsityFit.points, 0);
  assert.strictEqual(calculateScore(input({ industry: "Solar" })).wibsityFit.points, 20);
  assert.strictEqual(calculateScore(input({ industry: "solar" })).wibsityFit.points, 20); // case-insensitive
  assert.strictEqual(calculateScore(input({ industry: "Solar companies" })).wibsityFit.points, 8); // not an exact match
}

// Rating/review-count banding.
{
  assert.strictEqual(calculateScore(input({ rating: 5, reviewCount: 0 })).businessActivity.points, 12);
  assert.strictEqual(calculateScore(input({ rating: 0, reviewCount: 150 })).businessActivity.points, 8);
  assert.strictEqual(calculateScore(input({ rating: 2.5, reviewCount: 25 })).businessActivity.points, 6 + 4); // round(2.5/5*12)=6, band(25)=4
  assert.strictEqual(calculateScore(input({ rating: null, reviewCount: null })).businessActivity.points, 0);
}

// Target vs. non-target service area.
{
  assert.strictEqual(calculateScore(input({ city: "Noida" })).localRelevance.points, 10);
  assert.strictEqual(calculateScore(input({ city: "noida" })).localRelevance.points, 10); // case-insensitive
  assert.strictEqual(calculateScore(input({ city: "Mumbai" })).localRelevance.points, 3);
  assert.strictEqual(calculateScore(input({ city: null })).localRelevance.points, 0);
}

// Category boundaries.
{
  assert.strictEqual(calculateScore(input()).scoreCategory, "SKIP"); // 0/70
}

console.log("lib/scoring/calculate-score.test.ts: all checks passed");
