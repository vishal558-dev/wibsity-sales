import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDomain, normalizeName, normalizePhone } from "./normalize";
import type { RawBusiness } from "@/types/generation";

export interface ExistingLeadForDedup {
  id: string;
  business_name: string;
  website: string | null;
  phone: string | null;
  city: string | null;
  external_ids: string[];
}

// Match-key priority per docs/wibsity-sales-build-spec.md §30: external
// provider ID, then normalized website domain, then normalized phone,
// then normalized business name + city. First match wins.
export function findMatchingLead(
  business: RawBusiness,
  existingLeads: ExistingLeadForDedup[],
): string | null {
  if (business.external_id) {
    const match = existingLeads.find((lead) => lead.external_ids.includes(business.external_id!));
    if (match) return match.id;
  }

  const domain = normalizeDomain(business.website);
  if (domain) {
    const match = existingLeads.find((lead) => normalizeDomain(lead.website) === domain);
    if (match) return match.id;
  }

  const phone = normalizePhone(business.phone);
  if (phone) {
    const match = existingLeads.find((lead) => normalizePhone(lead.phone) === phone);
    if (match) return match.id;
  }

  const name = normalizeName(business.name).toLowerCase();
  const nameMatch = existingLeads.find(
    (lead) => normalizeName(lead.business_name).toLowerCase() === name && lead.city === business.city,
  );
  if (nameMatch) return nameMatch.id;

  return null;
}

interface LeadSourceRow {
  provider: string;
  external_id: string | null;
}

interface LeadRow {
  id: string;
  business_name: string;
  website: string | null;
  phone: string | null;
  city: string | null;
  lead_sources: LeadSourceRow[] | null;
}

// ponytail: O(n) full-org scan per result, done in application code rather
// than SQL, since normalized comparison (stripped domains/phones) isn't a
// plain column match. Add a normalized-domain/phone index or SQL-side
// lookup once org lead counts get large enough for this to matter.
export async function findDuplicateLeadId(
  supabase: SupabaseClient,
  organizationId: string,
  provider: string,
  business: RawBusiness,
): Promise<string | null> {
  const { data } = await supabase
    .from("leads")
    .select("id, business_name, website, phone, city, lead_sources(provider, external_id)")
    .eq("organization_id", organizationId);

  const existingLeads: ExistingLeadForDedup[] = ((data ?? []) as unknown as LeadRow[]).map((lead) => ({
    id: lead.id,
    business_name: lead.business_name,
    website: lead.website,
    phone: lead.phone,
    city: lead.city,
    external_ids: (lead.lead_sources ?? [])
      .filter((source) => source.provider === provider)
      .map((source) => source.external_id)
      .filter((id): id is string => Boolean(id)),
  }));

  return findMatchingLead(business, existingLeads);
}
