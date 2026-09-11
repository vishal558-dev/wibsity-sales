import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function NewLeadPage() {
  return (
    <>
      <PageHeader
        title="Generate leads"
        description="Find new prospects by industry and location."
      />
      <EmptyState
        icon={Sparkles}
        title="Lead generation is coming in Phase 3"
        description="This form will kick off an asynchronous job that finds, analyzes, and scores new leads."
      />
    </>
  );
}
