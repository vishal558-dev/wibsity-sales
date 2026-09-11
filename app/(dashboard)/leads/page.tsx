import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getLeads, getLeadFilterOptions } from "@/lib/crm/leads";
import { getPipelineStages } from "@/lib/crm/pipeline";
import { PageHeader } from "@/components/page-header";
import { LeadTable } from "@/components/leads/lead-table";
import { LeadSearch } from "@/components/leads/lead-search";
import { LeadFilters } from "@/components/leads/lead-filters";
import { Button } from "@/components/ui/button";
import type { LeadFilters as LeadFiltersType, ScoreCategory } from "@/types/lead";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user!.id)
    .single();
  const organizationId = profile!.organization_id;

  const filters: LeadFiltersType = {
    search: params.q,
    scoreCategory: params.score as ScoreCategory | undefined,
    stageSlug: params.stage,
    industry: params.industry,
    city: params.city,
    source: params.source,
    hasWebsite: params.website === "1",
    hasPhone: params.phone === "1",
    hasEmail: params.email === "1",
    followUpDue: params.followup === "1",
  };

  const [leads, options, stages] = await Promise.all([
    getLeads(supabase, organizationId, filters),
    getLeadFilterOptions(supabase, organizationId),
    getPipelineStages(supabase, organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Search, filter, and prioritize every lead in one table."
        actions={
          <Button render={<Link href="/leads/new" />} nativeButton={false}>
            <Plus />
            Generate leads
          </Button>
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <LeadSearch />
        <LeadFilters stages={stages} options={options} />
      </div>
      <LeadTable leads={leads} />
    </>
  );
}
