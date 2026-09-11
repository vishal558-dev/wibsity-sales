import { Badge } from "@/components/ui/badge";
import type { PipelineStageRef } from "@/types/lead";

export function LeadStatusBadge({ stage }: { stage: PipelineStageRef | null }) {
  if (!stage) return <span className="text-sm text-muted-foreground">—</span>;
  return <Badge variant="secondary">{stage.name}</Badge>;
}
