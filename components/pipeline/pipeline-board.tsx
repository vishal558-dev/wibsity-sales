"use client";

import { useOptimistic, useTransition } from "react";
import type { PipelineStage } from "@/types/pipeline";
import type { LeadRecord } from "@/types/lead";
import { PipelineColumn } from "@/components/pipeline/pipeline-column";
import { moveLeadToStageAction } from "@/app/(dashboard)/pipeline/actions";

export function PipelineBoard({
  stages,
  leads,
}: {
  stages: PipelineStage[];
  leads: LeadRecord[];
}) {
  const [, startTransition] = useTransition();
  const [optimisticLeads, setOptimisticLeads] = useOptimistic(
    leads,
    (current, update: { leadId: string; stageId: string }) =>
      current.map((lead) =>
        lead.id === update.leadId ? { ...lead, pipeline_stage_id: update.stageId } : lead,
      ),
  );

  function handleDrop(leadId: string, stage: PipelineStage) {
    startTransition(async () => {
      setOptimisticLeads({ leadId, stageId: stage.id });
      await moveLeadToStageAction(leadId, stage.id, stage.name);
    });
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage) => (
        <PipelineColumn
          key={stage.id}
          stage={stage}
          leads={optimisticLeads.filter((lead) => lead.pipeline_stage_id === stage.id)}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );
}
