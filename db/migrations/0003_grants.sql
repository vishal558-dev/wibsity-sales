-- Tables created via raw SQL don't get Supabase's usual auto-grants, so the
-- API roles (authenticated: normal app queries, service_role: seed script and
-- future background jobs) need explicit privileges. RLS still applies to
-- `authenticated`; `service_role` bypasses RLS entirely per its role config.
-- `anon` is intentionally left out — this app requires login for all data access.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant usage, select on all sequences in schema public
  to authenticated, service_role;

grant execute on all functions in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

alter default privileges in schema public
  grant execute on functions to authenticated, service_role;
