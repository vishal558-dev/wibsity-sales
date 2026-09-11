import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function LeadsPage() {
  return (
    <>
      <PageHeader
        title="Leads"
        description="Search, filter, and prioritize every lead in one table."
      />
      <EmptyState
        icon={Users}
        title="Lead management is coming in Phase 2"
        description="The leads table, search, and filters ship in Phase 2."
      />
    </>
  );
}
