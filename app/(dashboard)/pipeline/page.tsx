import { KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Drag leads through the stages from new to won."
      />
      <EmptyState
        icon={KanbanSquare}
        title="The pipeline board is coming in Phase 2"
        description="Leads will move through New, Qualified, Contacted, Replied, Demo Sent, Meeting, Proposal, Won, and Lost."
      />
    </>
  );
}
