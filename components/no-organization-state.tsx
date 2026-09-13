import { EmptyState } from "@/components/empty-state";

// Shown when a signed-in user's account has no organization yet (e.g. a
// fresh Supabase user created outside db/seed.ts) — distinct from "not
// signed in", which the (dashboard) layout already redirects to /login
// before any page renders.
export function NoOrganizationState() {
  return (
    <EmptyState
      title="No organization set up yet"
      description="Run db/seed.ts to create a demo organization and leads."
    />
  );
}
