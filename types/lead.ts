export type ScoreCategory = "HOT" | "WARM" | "LOW" | "SKIP";

export interface Lead {
  id: string;
  business_name: string;
  city: string | null;
  state: string | null;
  score: number | null;
  score_category: ScoreCategory | null;
  last_contacted_at: string | null;
  next_followup_at: string | null;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  type: string;
  description: string;
  created_at: string;
  lead: { business_name: string } | null;
}

export interface PipelineStageRef {
  id: string;
  name: string;
  slug: string;
}

export interface LeadRecord {
  id: string;
  business_name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  country: string;
  rating: number | null;
  review_count: number | null;
  source: string | null;
  score: number | null;
  score_category: ScoreCategory | null;
  pipeline_stage_id: string | null;
  pipeline_stage: PipelineStageRef | null;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  created_at: string;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  content: string;
  created_at: string;
}

export interface LeadFilters {
  search?: string;
  scoreCategory?: ScoreCategory;
  stageSlug?: string;
  industry?: string;
  city?: string;
  source?: string;
  hasWebsite?: boolean;
  hasPhone?: boolean;
  hasEmail?: boolean;
  followUpDue?: boolean;
}

export interface LeadFilterOptions {
  industries: string[];
  cities: string[];
  sources: string[];
}
