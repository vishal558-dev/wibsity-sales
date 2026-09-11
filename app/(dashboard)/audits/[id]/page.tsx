import { SearchCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;

  return (
    <>
      <PageHeader title="Audit" description="Scores, findings, and recommendations." />
      <EmptyState
        icon={SearchCheck}
        title="Audit detail is coming in Phase 4"
        description="The score breakdown, technical findings, and AI summary land here."
      />
    </>
  );
}
