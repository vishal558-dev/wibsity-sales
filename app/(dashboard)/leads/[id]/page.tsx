import { UserRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;

  return (
    <>
      <PageHeader title="Lead" description="Contact info, score, and activity for this lead." />
      <EmptyState
        icon={UserRound}
        title="Lead detail is coming in Phase 2"
        description="Contact actions, the score breakdown, notes, and the activity timeline land here."
      />
    </>
  );
}
