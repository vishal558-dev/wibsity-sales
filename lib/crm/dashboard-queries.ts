import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, LeadActivity } from "@/types/lead";

export interface KpiCounts {
  hotLeads: number;
  warmLeads: number;
  followUpsDue: number;
  replies: number;
  demosAndMeetings: number;
}

export interface DashboardSnapshot {
  hasAnyLeads: boolean;
  kpis: KpiCounts;
  todaysActions: Lead[];
  priorityLeads: Lead[];
  recentActivity: LeadActivity[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isLead(value: unknown): value is Lead {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.business_name === "string" &&
    isNullableString(value.city) &&
    isNullableString(value.state) &&
    isNullableNumber(value.score) &&
    isNullableString(value.score_category) &&
    isNullableString(value.last_contacted_at) &&
    isNullableString(value.next_followup_at)
  );
}

function isLeadActivity(value: unknown): value is LeadActivity {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.lead_id === "string" &&
    typeof value.type === "string" &&
    typeof value.description === "string" &&
    typeof value.created_at === "string" &&
    (value.lead === null ||
      (isRecord(value.lead) && typeof value.lead.business_name === "string"))
  );
}

export function parseDashboardSnapshot(value: unknown): DashboardSnapshot {
  if (!isRecord(value) || !isRecord(value.kpis)) {
    throw new Error("Dashboard returned an invalid response.");
  }

  const { kpis } = value;
  const hasValidKpis =
    typeof kpis.hotLeads === "number" &&
    typeof kpis.warmLeads === "number" &&
    typeof kpis.followUpsDue === "number" &&
    typeof kpis.replies === "number" &&
    typeof kpis.demosAndMeetings === "number";

  if (
    typeof value.hasAnyLeads !== "boolean" ||
    !hasValidKpis ||
    !Array.isArray(value.todaysActions) ||
    !value.todaysActions.every(isLead) ||
    !Array.isArray(value.priorityLeads) ||
    !value.priorityLeads.every(isLead) ||
    !Array.isArray(value.recentActivity) ||
    !value.recentActivity.every(isLeadActivity)
  ) {
    throw new Error("Dashboard returned an invalid response.");
  }

  return value as unknown as DashboardSnapshot;
}

export async function getDashboardSnapshot(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<DashboardSnapshot> {
  const { data, error } = await supabase.rpc("get_dashboard_snapshot", {
    p_organization_id: organizationId,
  });

  if (error) {
    throw new Error("Unable to load the dashboard right now.", { cause: error });
  }

  return parseDashboardSnapshot(data);
}
