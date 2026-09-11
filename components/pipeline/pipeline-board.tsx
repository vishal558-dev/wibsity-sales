import type { PipelineStage } from "@/types/pipeline";
import type { LeadRecord } from "@/types/lead";
import { PipelineColumn } from "@/components/pipeline/pipeline-column";

export function PipelineBoard({
  stages,
  leads,
}: {
  stages: PipelineStage[];
  leads: LeadRecord[];
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage) => (
        <PipelineColumn
          key={stage.id}
          stage={stage}
          leads={leads.filter((lead) => lead.pipeline_stage_id === stage.id)}
        />
      ))}
    </div>
  );
}
