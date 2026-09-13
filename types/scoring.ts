import type { ScoreCategory } from "@/types/lead";

export interface ScoreFactor {
  points: number;
  maxPoints: number;
}

export interface ScoreBreakdown {
  websiteOpportunity: ScoreFactor | null;
  businessActivity: ScoreFactor;
  wibsityFit: ScoreFactor;
  contactability: ScoreFactor;
  localRelevance: ScoreFactor;
  other: ScoreFactor;
  overallScore: number;
  scoreCategory: ScoreCategory;
}

export interface ScoreInput {
  rating: number | null;
  reviewCount: number | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  hasContact: boolean;
  city: string | null;
  // undefined = no completed audit exists at all; null = a completed audit
  // exists but the site was unreachable. Both mean "no real signal" and
  // are treated identically by calculateScore.
  websiteAuditScore: number | null | undefined;
}
