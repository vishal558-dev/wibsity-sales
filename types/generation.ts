export type GenerationJobStatus = "pending" | "processing" | "completed" | "failed";
export type GenerationResultStatus = "pending" | "created" | "filtered" | "duplicate";

export interface GenerationJob {
  id: string;
  organization_id: string;
  industry: string;
  location: string;
  requested_count: number;
  min_rating: number | null;
  website_required: boolean;
  phone_required: boolean;
  status: GenerationJobStatus;
  progress: number;
  found_count: number;
  analyzed_count: number;
  qualified_count: number;
  duplicate_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface RawBusiness {
  external_id: string | null;
  name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  industry: string;
  city: string | null;
  state: string | null;
  country: string;
  rating: number | null;
  review_count: number | null;
  source_url: string | null;
}

export interface GenerationResult {
  id: string;
  generation_job_id: string;
  external_id: string | null;
  business_name: string;
  raw_data: RawBusiness;
  status: GenerationResultStatus;
  lead_id: string | null;
  created_at: string;
}

export interface GenerationJobCounters {
  found_count: number;
  analyzed_count: number;
  qualified_count: number;
  duplicate_count: number;
  progress: number;
}
