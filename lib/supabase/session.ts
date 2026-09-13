import { cache } from "react";
import { createClient } from "./server";
import type { User } from "@supabase/supabase-js";

// Wrapped in React.cache: every Server Component that needs the signed-in
// user within the same request (the dashboard layout, and — via
// getSessionOrganizationId below — every page's own org lookup) shares one
// auth.getUser() call instead of each repeating it. Scoped to the current
// request only; no sharing between requests.
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// Cached for the same reason — every dashboard page needs this exact
// lookup, so share one users-table query instead of repeating it. Returns
// null both when there's no signed-in user (the (dashboard) layout already
// redirects that case to /login before any page renders, so in practice a
// page only ever sees null here for the other reason) and when the user's
// own `users` row has no organization_id yet — a real, distinct state from
// "not signed in", not one an unchecked `profile!.organization_id` should
// silently crash on.
export const getSessionOrganizationId = cache(async (): Promise<string | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.organization_id ?? null;
});
