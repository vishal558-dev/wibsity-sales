-- wibsity sales: Phase 4 website audit additions.
-- website_audits currently requires overall_score/summary NOT NULL, which
-- leaves no room for a pending/processing row while an audit is running.
-- Mirrors generation_jobs' status/error pattern (Phase 3) so the same
-- async-job-with-polling-progress architecture applies uniformly. No RLS
-- changes needed: the existing org_isolation policy (scoped via the leads
-- join, db/migrations/0002_rls_policies.sql) already covers new columns.

alter table website_audits
  alter column overall_score drop not null,
  alter column summary drop not null,
  add column status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  add column error text;
