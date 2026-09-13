-- wibsity sales: protect organization membership.
--
-- RLS derives every tenant boundary from users.organization_id. Letting an
-- authenticated user update that column would let them select a different
-- tenant for their own session, so profile rows are service-role managed.

revoke insert, update, delete on table public.users from authenticated;

drop policy if exists "self_only" on public.users;
drop policy if exists "self_read" on public.users;
create policy "self_read" on public.users
  for select
  to authenticated
  using (id = auth.uid());

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Restrict
-- both organization-scoping helpers to the roles that need them.
revoke all on function public.current_organization_id() from public;
grant execute on function public.current_organization_id() to authenticated, service_role;

revoke all on function public.get_dashboard_snapshot(uuid) from public;
grant execute on function public.get_dashboard_snapshot(uuid) to authenticated, service_role;
