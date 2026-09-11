import type { PipelineStage } from "@/types/pipeline";
import type { LeadRecord } from "@/types/lead";
import { PipelineCard } from "@/components/pipeline/pipeline-card";

export function PipelineColumn({
  stage,
  leads,
}: {
  stage: PipelineStage;
  leads: LeadRecord[];
}) {
  return (
    <div className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2">
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-sm font-medium text-foreground">{stage.name}</span>
        <span className="text-sm text-muted-foreground">{leads.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {leads.map((lead) => (
          <PipelineCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}
