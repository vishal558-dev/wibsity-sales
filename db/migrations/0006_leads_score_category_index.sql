-- wibsity sales: dashboard speed.
-- The HOT/WARM KPI counts on every dashboard load filter leads by
-- (organization_id, score_category), but no index covered that
-- combination — only (organization_id), (organization_id, score), and
-- (organization_id, next_followup_at) existed. Without it, Postgres has to
-- scan every one of an org's leads to answer the two highest-traffic
-- queries on the app's first-hit page.

create index leads_organization_score_category_idx on leads (organization_id, score_category);
