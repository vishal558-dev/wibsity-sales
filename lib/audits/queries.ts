import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditIssue, WebsiteAudit } from "@/types/audit";

export interface AuditWithLead extends WebsiteAudit {
  lead: { id: string; business_name: string };
}

export async function getLatestAuditForLead(supabase: SupabaseClient, leadId: string): Promise<WebsiteAudit | null> {
  const { data } = await supabase
    .from("website_audits")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as WebsiteAudit | null;
}

// PostgREST doesn't expose SQL's DISTINCT ON, so this fetches every audit
// for the org's leads (newest first) and keeps only the first row seen per
// lead_id in application code — simplest thing that produces "latest audit
// per lead" without a raw-SQL view.
export async function getLatestAuditsForOrg(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<AuditWithLead[]> {
  const { data } = await supabase
    .from("website_audits")
    .select("*, lead:leads!inner(id, business_name, organization_id)")
    .eq("lead.organization_id", organizationId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as AuditWithLead[];
  const seen = new Set<string>();
  const latest: AuditWithLead[] = [];
  for (const row of rows) {
    if (seen.has(row.lead_id)) continue;
    seen.add(row.lead_id);
    latest.push(row);
  }
  return latest;
}

export async function getAuditById(supabase: SupabaseClient, auditId: string): Promise<AuditWithLead | null> {
  const { data } = await supabase
    .from("website_audits")
    .select("*, lead:leads(id, business_name)")
    .eq("id", auditId)
    .maybeSingle();
  return data as unknown as AuditWithLead | null;
}

export async function getIssuesForAudit(supabase: SupabaseClient, auditId: string): Promise<AuditIssue[]> {
  const { data } = await supabase
    .from("audit_issues")
    .select("*")
    .eq("audit_id", auditId)
    .order("created_at", { ascending: true });
  return (data ?? []) as AuditIssue[];
}
