-- wibsity sales: Phase 3 lead generation additions.
-- Generation jobs need to persist their filter inputs so a resumed/retried
-- run (which only receives a job id, not the original form submission) can
-- still apply the same qualify gate. generation_results needs a lead_id so
-- a resumed run can tell which rows already produced a lead without
-- re-deriving it, and so duplicate rows can be traced to the lead they
-- matched. No RLS changes needed: both tables' existing org_isolation
-- policies (db/migrations/0002_rls_policies.sql) already cover new columns.

alter table generation_jobs
  add column min_rating numeric,
  add column website_required boolean not null default false,
  add column phone_required boolean not null default false;

alter table generation_results
  add column lead_id uuid references leads (id) on delete set null;

create index generation_results_lead_id_idx on generation_results (lead_id);
