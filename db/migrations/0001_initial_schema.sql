-- wibsity sales: Phase 1 schema.
-- Column sets for leads, lead_contacts, lead_sources, lead_activities, lead_notes,
-- website_audits, audit_issues, pipeline_stages, generation_jobs, and generation_results
-- are taken verbatim from the build spec (docs/wibsity-sales-build-spec.md, section 19).
-- organizations, users, lead_tags, and lead_tag_assignments are named there but not
-- detailed, so they get a minimal reasonable design here.

create extension if not exists pgcrypto;

-- organizations ---------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- users (1:1 with auth.users, adds organization membership) -------------

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create index users_organization_id_idx on users (organization_id);

-- pipeline_stages --------------------------------------------------------

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index pipeline_stages_organization_id_idx on pipeline_stages (organization_id);

-- leads -------------------------------------------------------------------

create table leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  business_name text not null,
  website text,
  phone text,
  email text,
  industry text,
  city text,
  state text,
  country text not null default 'India',
  rating numeric,
  review_count integer,
  source text,
  source_url text,

  score integer,
  score_category text,

  pipeline_stage_id uuid references pipeline_stages (id) on delete set null,
  last_contacted_at timestamptz,
  next_followup_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_organization_id_idx on leads (organization_id);
create index leads_pipeline_stage_id_idx on leads (pipeline_stage_id);
create index leads_organization_score_idx on leads (organization_id, score);
create index leads_organization_next_followup_idx on leads (organization_id, next_followup_at);

-- lead_contacts -------------------------------------------------------------------

create table lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  name text,
  role text,
  phone text,
  email text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lead_contacts_lead_id_idx on lead_contacts (lead_id);

-- lead_sources -------------------------------------------------------------------

create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  provider text not null,
  external_id text,
  source_url text,
  raw_data jsonb,
  created_at timestamptz not null default now()
);

create index lead_sources_lead_id_idx on lead_sources (lead_id);

-- lead_tags ---------------------------------------------------------------

create table lead_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index lead_tags_organization_id_idx on lead_tags (organization_id);

-- lead_tag_assignments -----------------------------------------------------

create table lead_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  lead_tag_id uuid not null references lead_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (lead_id, lead_tag_id)
);

create index lead_tag_assignments_lead_id_idx on lead_tag_assignments (lead_id);
create index lead_tag_assignments_lead_tag_id_idx on lead_tag_assignments (lead_tag_id);

-- lead_activities -------------------------------------------------------------------

create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  type text not null,
  description text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index lead_activities_lead_id_idx on lead_activities (lead_id);

-- lead_notes -------------------------------------------------------------------

create table lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lead_notes_lead_id_idx on lead_notes (lead_id);

-- website_audits -------------------------------------------------------------------

create table website_audits (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  overall_score integer not null,
  performance_score integer,
  mobile_score integer,
  seo_score integer,
  conversion_score integer,

  summary text not null,
  raw_results jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index website_audits_lead_id_idx on website_audits (lead_id);

-- audit_issues -------------------------------------------------------------------

create table audit_issues (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references website_audits (id) on delete cascade,
  category text not null,
  severity text not null,
  title text not null,
  description text not null,
  evidence jsonb,
  created_at timestamptz not null default now()
);

create index audit_issues_audit_id_idx on audit_issues (audit_id);

-- generation_jobs -------------------------------------------------------------------

create table generation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  industry text not null,
  location text not null,
  requested_count integer not null,

  status text not null default 'pending',
  progress integer not null default 0,
  found_count integer not null default 0,
  analyzed_count integer not null default 0,
  qualified_count integer not null default 0,
  duplicate_count integer not null default 0,

  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index generation_jobs_organization_id_idx on generation_jobs (organization_id);

-- generation_results -------------------------------------------------------------------

create table generation_results (
  id uuid primary key default gen_random_uuid(),
  generation_job_id uuid not null references generation_jobs (id) on delete cascade,
  external_id text,
  business_name text not null,
  raw_data jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index generation_results_generation_job_id_idx on generation_results (generation_job_id);
