import { createClient } from "@supabase/supabase-js";

// Service-role client for background work with no user session (the
// Inngest function in lib/inngest/functions/). This bypasses RLS entirely
// (db/migrations/0003_grants.sql grants service_role full table access for
// exactly this) — never use it from a request path that has a session;
// use lib/supabase/server.ts there so RLS enforces org-scoping normally.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
