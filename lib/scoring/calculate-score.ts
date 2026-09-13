import type { ScoreBreakdown, ScoreFactor, ScoreInput } from "@/types/scoring";
import { TARGET_INDUSTRIES, TARGET_SERVICE_AREAS } from "./config";

function matchesTarget(value: string, targets: string[]): boolean {
  return targets.some((target) => target.toLowerCase() === value.toLowerCase());
}

// Inverted: a worse audit score means more room for wibsity to help. null
// means "no real signal" (no completed audit, or the site was unreachable)
// — a genuinely different state from "0 opportunity", so it's never
// silently scored as zero.
function calculateWebsiteOpportunity(auditScore: number | null | undefined): ScoreFactor | null {
  if (auditScore == null) return null;
  return { points: Math.round((100 - auditScore) * 0.3), maxPoints: 30 };
}

function reviewCountBand(reviewCount: number): number {
  if (reviewCount >= 100) return 8;
  if (reviewCount >= 50) return 6;
  if (reviewCount >= 10) return 4;
  if (reviewCount >= 1) return 2;
  return 0;
}

// Unlike the website factor, a missing rating/review count here is itself a
// real signal (no reviews = low activity), not an unassessed state — this
// factor always resolves to a number, never null.
function calculateBusinessActivity(rating: number | null, reviewCount: number | null): ScoreFactor {
  const ratingPoints = Math.min(12, Math.max(0, Math.round(((rating ?? 0) / 5) * 12)));
  const reviewCountPoints = reviewCountBand(reviewCount ?? 0);
  return { points: ratingPoints + reviewCountPoints, maxPoints: 20 };
}

function calculateWibsityFit(industry: string | null): ScoreFactor {
  if (!industry) return { points: 0, maxPoints: 20 };
  return { points: matchesTarget(industry, TARGET_INDUSTRIES) ? 20 : 8, maxPoints: 20 };
}

// website is deliberately not counted here — its condition is already fully
// covered by websiteOpportunity, and counting it again would double-weight
// the same signal under a label it doesn't really belong to.
function calculateContactability(phone: string | null, email: string | null, hasContact: boolean): ScoreFactor {
  const points = (phone ? 6 : 0) + (email ? 6 : 0) + (hasContact ? 3 : 0);
  return { points, maxPoints: 15 };
}

function calculateLocalRelevance(city: string | null): ScoreFactor {
  if (!city) return { points: 0, maxPoints: 10 };
  return { points: matchesTarget(city, TARGET_SERVICE_AREAS) ? 10 : 3, maxPoints: 10 };
}

function categoryForScore(score: number): ScoreBreakdown["scoreCategory"] {
  if (score >= 80) return "HOT";
  if (score >= 60) return "WARM";
  if (score >= 40) return "LOW";
  return "SKIP";
}

export function calculateScore(input: ScoreInput): ScoreBreakdown {
  const websiteOpportunity = calculateWebsiteOpportunity(input.websiteAuditScore);
  const businessActivity = calculateBusinessActivity(input.rating, input.reviewCount);
  const wibsityFit = calculateWibsityFit(input.industry);
  const contactability = calculateContactability(input.phone, input.email, input.hasContact);
  const localRelevance = calculateLocalRelevance(input.city);
  const other: ScoreFactor = { points: 0, maxPoints: 5 };

  const knownFactors: ScoreFactor[] = [businessActivity, wibsityFit, contactability, localRelevance, other];
  if (websiteOpportunity) knownFactors.push(websiteOpportunity);

  const earnedPoints = knownFactors.reduce((sum, factor) => sum + factor.points, 0);
  const possiblePoints = knownFactors.reduce((sum, factor) => sum + factor.maxPoints, 0);
  const overallScore = Math.round((earnedPoints / possiblePoints) * 100);

  return {
    websiteOpportunity,
    businessActivity,
    wibsityFit,
    contactability,
    localRelevance,
    other,
    overallScore,
    scoreCategory: categoryForScore(overallScore),
  };
}
