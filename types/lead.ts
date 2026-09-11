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
