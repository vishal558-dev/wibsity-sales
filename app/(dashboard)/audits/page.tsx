import { SearchCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function AuditsPage() {
  return (
    <>
      <PageHeader
        title="Audits"
        description="Website audits generated for every analyzed lead."
      />
      <EmptyState
        icon={SearchCheck}
        title="Website audits are coming in Phase 4"
        description="Technical checks, scores, and AI-interpreted findings ship in Phase 4."
      />
    </>
  );
}
