import { createClient } from "@/lib/supabase/server";
import { getSessionOrganizationId } from "@/lib/supabase/session";
import { getDashboardSnapshot } from "@/lib/crm/dashboard-queries";
import { StatCard } from "@/components/dashboard/stat-card";
import { LeadActionList } from "@/components/dashboard/lead-action-list";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { EmptyState } from "@/components/empty-state";
import { NoOrganizationState } from "@/components/no-organization-state";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const organizationId = await getSessionOrganizationId();

  if (!organizationId) {
    return <NoOrganizationState />;
  }

  const supabase = await createClient();

  const dashboard = await getDashboardSnapshot(supabase, organizationId);

  if (!dashboard.hasAnyLeads) {
    return (
      <EmptyState
        title="No leads yet"
        description="Run db/seed.ts to create demo leads, or generate real leads once Phase 3 ships."
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">
          {greeting()} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what needs your attention today.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Hot leads" value={dashboard.kpis.hotLeads} accentClassName="bg-score-hot" />
        <StatCard label="Warm leads" value={dashboard.kpis.warmLeads} accentClassName="bg-score-warm" />
        <StatCard label="Follow-ups due" value={dashboard.kpis.followUpsDue} />
        <StatCard label="Replies" value={dashboard.kpis.replies} />
        <StatCard label="Demos / meetings" value={dashboard.kpis.demosAndMeetings} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">TODAY&apos;S ACTIONS</h2>
        <LeadActionList
          leads={dashboard.todaysActions}
          showFollowUp
          emptyMessage="Nothing due today"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">PRIORITY LEADS</h2>
          <LeadActionList leads={dashboard.priorityLeads} emptyMessage="No uncontacted leads" />
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">RECENT ACTIVITY</h2>
          <RecentActivity activities={dashboard.recentActivity} />
        </div>
      </div>
    </>
  );
}
