import { createClient } from "@/lib/supabase/server";
import { getSessionOrganizationId } from "@/lib/supabase/session";
import { getPipelineLeads, getPipelineStages } from "@/lib/crm/pipeline";
import { PageHeader } from "@/components/page-header";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { NoOrganizationState } from "@/components/no-organization-state";

export default async function PipelinePage() {
  const organizationId = await getSessionOrganizationId();

  if (!organizationId) {
    return <NoOrganizationState />;
  }

  const supabase = await createClient();

  const [stages, leads] = await Promise.all([
    getPipelineStages(supabase, organizationId),
    getPipelineLeads(supabase, organizationId),
  ]);

  return (
    <>
      <PageHeader title="Pipeline" description="Drag leads through the stages from new to won." />
      <PipelineBoard stages={stages} leads={leads} />
    </>
  );
}
