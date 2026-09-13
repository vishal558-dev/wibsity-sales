-- wibsity sales: dashboard snapshot.
--
-- The dashboard previously made ten PostgREST requests for every visit. Keep
-- the aggregation work close to the data and return the small, fixed-size
-- payload the page actually renders in one round trip. SECURITY INVOKER is
-- intentional: the existing RLS policies still apply to every table read by
-- this function.

create or replace function public.get_dashboard_snapshot(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with metrics as (
    select
      count(lead.id) as lead_count,
      count(lead.id) filter (where lead.score_category = 'HOT') as hot_leads,
      count(lead.id) filter (where lead.score_category = 'WARM') as warm_leads,
      count(lead.id) filter (
        where lead.next_followup_at <= date_trunc('day', now()) + interval '1 day' - interval '1 millisecond'
      ) as follow_ups_due,
      count(lead.id) filter (where stage.slug = 'replied') as replies,
      count(lead.id) filter (where stage.slug in ('demo_sent', 'meeting')) as demos_and_meetings
    from public.leads as lead
    left join public.pipeline_stages as stage on stage.id = lead.pipeline_stage_id
    where lead.organization_id = p_organization_id
  )
  select jsonb_build_object(
    'hasAnyLeads', metrics.lead_count > 0,
    'kpis', jsonb_build_object(
      'hotLeads', metrics.hot_leads,
      'warmLeads', metrics.warm_leads,
      'followUpsDue', metrics.follow_ups_due,
      'replies', metrics.replies,
      'demosAndMeetings', metrics.demos_and_meetings
    ),
    'todaysActions', coalesce((
      select jsonb_agg(to_jsonb(action) order by action.next_followup_at asc)
      from (
        select id, business_name, city, state, score, score_category, last_contacted_at, next_followup_at
        from public.leads
        where organization_id = p_organization_id
          and next_followup_at <= date_trunc('day', now()) + interval '1 day' - interval '1 millisecond'
        order by next_followup_at asc
        limit 5
      ) as action
    ), '[]'::jsonb),
    'priorityLeads', coalesce((
      select jsonb_agg(to_jsonb(lead) order by lead.score desc nulls last)
      from (
        select id, business_name, city, state, score, score_category, last_contacted_at, next_followup_at
        from public.leads
        where organization_id = p_organization_id
          and last_contacted_at is null
        order by score desc nulls last
        limit 5
      ) as lead
    ), '[]'::jsonb),
    'recentActivity', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', activity.id,
          'lead_id', activity.lead_id,
          'type', activity.type,
          'description', activity.description,
          'created_at', activity.created_at,
          'lead', jsonb_build_object('business_name', activity.business_name)
        ) order by activity.created_at desc
      )
      from (
        select
          lead_activity.id,
          lead_activity.lead_id,
          lead_activity.type,
          lead_activity.description,
          lead_activity.created_at,
          lead.business_name
        from public.lead_activities as lead_activity
        join public.leads as lead on lead.id = lead_activity.lead_id
        where lead.organization_id = p_organization_id
        order by lead_activity.created_at desc
        limit 8
      ) as activity
    ), '[]'::jsonb)
  )
  from metrics;
$$;
