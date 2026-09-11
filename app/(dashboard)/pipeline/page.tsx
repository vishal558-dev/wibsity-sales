import { createClient } from "@/lib/supabase/server";
import { getPipelineLeads, getPipelineStages } from "@/lib/crm/pipeline";
import { PageHeader } from "@/components/page-header";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";

export default async function PipelinePage() {
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
