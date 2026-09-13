import assert from "node:assert";
import { parseDashboardSnapshot } from "./dashboard-queries";

const snapshot = {
  hasAnyLeads: true,
  kpis: {
    hotLeads: 2,
    warmLeads: 3,
    followUpsDue: 1,
    replies: 4,
    demosAndMeetings: 5,
  },
  todaysActions: [
    {
      id: "lead-1",
      business_name: "Acme",
      city: "Pune",
      state: "Maharashtra",
      score: 90,
      score_category: "HOT",
      last_contacted_at: null,
      next_followup_at: "2026-09-13T09:00:00.000Z",
    },
  ],
  priorityLeads: [],
  recentActivity: [
    {
      id: "activity-1",
      lead_id: "lead-1",
      type: "note",
      description: "Added a note",
      created_at: "2026-09-13T09:00:00.000Z",
      lead: { business_name: "Acme" },
    },
  ],
};

assert.deepStrictEqual(parseDashboardSnapshot(snapshot), snapshot);
assert.throws(
  () => parseDashboardSnapshot({ ...snapshot, kpis: { ...snapshot.kpis, hotLeads: "2" } }),
  /invalid response/,
);

console.log("lib/crm/dashboard-queries.test.ts: all checks passed");
