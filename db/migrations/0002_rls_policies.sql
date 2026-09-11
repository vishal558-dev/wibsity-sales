-- wibsity sales: Row Level Security.
-- V1 has exactly one role (the operator), so every table gets a single
-- `for all` org-scoped policy rather than four per-action policies.

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.users where id = auth.uid()
$$;

-- Tables with a direct organization_id column ----------------------------

alter table organizations enable row level security;
create policy "org_isolation" on organizations for all
  using (id = public.current_organization_id())
  with check (id = public.current_organization_id());

alter table users enable row level security;
create policy "self_only" on users for all
  using (id = auth.uid())
  with check (id = auth.uid());

alter table pipeline_stages enable row level security;
create policy "org_isolation" on pipeline_stages for all
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

alter table leads enable row level security;
create policy "org_isolation" on leads for all
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

alter table lead_tags enable row level security;
create policy "org_isolation" on lead_tags for all
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

alter table generation_jobs enable row level security;
create policy "org_isolation" on generation_jobs for all
  using (organization_id = public.current_organization_id())
  with check (organization_id = public.current_organization_id());

-- Child tables scoped via their parent's organization_id ------------------

alter table lead_contacts enable row level security;
create policy "org_isolation" on lead_contacts for all
  using (exists (
    select 1 from leads
    where leads.id = lead_contacts.lead_id
    and leads.organization_id = public.current_organization_id()
  ))
  with check (exists (
    select 1 from leads
    where leads.id = lead_contacts.lead_id
    and leads.organization_id = public.current_organization_id()
  ));

alter table lead_sources enable row level security;
create policy "org_isolation" on lead_sources for all
  using (exists (
    select 1 from leads
    where leads.id = lead_sources.lead_id
    and leads.organization_id = public.current_organization_id()
  ))
  with check (exists (
    select 1 from leads
    where leads.id = lead_sources.lead_id
    and leads.organization_id = public.current_organization_id()
  ));

alter table lead_tag_assignments enable row level security;
create policy "org_isolation" on lead_tag_assignments for all
  using (exists (
    select 1 from leads
    where leads.id = lead_tag_assignments.lead_id
    and leads.organization_id = public.current_organization_id()
  ))
  with check (exists (
    select 1 from leads
    where leads.id = lead_tag_assignments.lead_id
    and leads.organization_id = public.current_organization_id()
  ));

alter table lead_activities enable row level security;
create policy "org_isolation" on lead_activities for all
  using (exists (
    select 1 from leads
    where leads.id = lead_activities.lead_id
    and leads.organization_id = public.current_organization_id()
  ))
  with check (exists (
    select 1 from leads
    where leads.id = lead_activities.lead_id
    and leads.organization_id = public.current_organization_id()
  ));

alter table lead_notes enable row level security;
create policy "org_isolation" on lead_notes for all
  using (exists (
    select 1 from leads
    where leads.id = lead_notes.lead_id
    and leads.organization_id = public.current_organization_id()
  ))
  with check (exists (
    select 1 from leads
    where leads.id = lead_notes.lead_id
    and leads.organization_id = public.current_organization_id()
  ));

alter table website_audits enable row level security;
create policy "org_isolation" on website_audits for all
  using (exists (
    select 1 from leads
    where leads.id = website_audits.lead_id
    and leads.organization_id = public.current_organization_id()
  ))
  with check (exists (
    select 1 from leads
    where leads.id = website_audits.lead_id
    and leads.organization_id = public.current_organization_id()
  ));

alter table audit_issues enable row level security;
create policy "org_isolation" on audit_issues for all
  using (exists (
    select 1 from website_audits
    join leads on leads.id = website_audits.lead_id
    where website_audits.id = audit_issues.audit_id
    and leads.organization_id = public.current_organization_id()
  ))
  with check (exists (
    select 1 from website_audits
    join leads on leads.id = website_audits.lead_id
    where website_audits.id = audit_issues.audit_id
    and leads.organization_id = public.current_organization_id()
  ));

alter table generation_results enable row level security;
create policy "org_isolation" on generation_results for all
  using (exists (
    select 1 from generation_jobs
    where generation_jobs.id = generation_results.generation_job_id
    and generation_jobs.organization_id = public.current_organization_id()
  ))
  with check (exists (
    select 1 from generation_jobs
    where generation_jobs.id = generation_results.generation_job_id
    and generation_jobs.organization_id = public.current_organization_id()
  ));
