-- BP-8 × BP-13: onboarding blockers are a source of their own on Today. A finding family whose members all carry scope
-- 'BP-13:onboarding:<step>' is source 'onboarding': it is offered to the roles that can do the step (HR, CFO, managers),
-- carries the step's owner role as 'who', is guaranteed on the page as its source's top 3, and is weighted by the row
-- conversion_factors.today_onboarding_weight (a multiplier the owner can set to 1 after go-live) — the eight blockers
-- carry no dollars and were ranking below the money findings in the very week they must be done. Decisions on them
-- go through f_decide as finding groups (key 'fg|…'), unchanged.
set search_path = public;
insert into public.conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status)
values ('today_onboarding_weight', 6, 'multiplier', 'Today: weight of onboarding blockers',
        'Multiplies the Today score of an open onboarding blocker so the company''s go-live steps rank above money findings until go-live. Set it to 1 after go-live.',
        'Claude, 15 Sep 2026 — BP-13 onboarding pack; the blockers carried no dollars and ranked below rank 60 of 278.', 'Claude', 'owner_set')
on conflict (key) do nothing;

CREATE OR REPLACE FUNCTION public.f_today_feed(p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text := public.current_app_role()::text; v_all boolean; v_out jsonb;
begin
  if r is null then raise exception 'Sign in to read Today.' using errcode = '42501'; end if;
  v_all := r in ('owner', 'executive', 'admin');
  with fg as (
    select 'fg|' || f.severity || '|' || public.f_finding_family(f.headline) as key,
           case when bool_and(f.scope like 'BP-13:onboarding:%') then 'onboarding' when bool_and(f.scope like 'qa:%') then 'report' else 'finding_group' end as source, f.severity,
           public.f_finding_family(f.headline) as what,
           string_agg(distinct coalesce(f.agent_key, f.agent), ', ') as why,
           count(*)::int as n, sum(coalesce(f.dollars, 0)) as dollars, sum(coalesce(f.pounds, 0)) as pounds,
           min(f.detected_at) as oldest, max(f.detected_at) as newest,
           (array_agg(f.action order by f.detected_at desc))[1] as recommendation,
           (array_agg(f.drill_to order by f.detected_at desc) filter (where f.drill_to is not null))[1] as drill_to,
           case when bool_and(f.scope like 'BP-13:onboarding:%') then (select i.owner_role from public.onboarding_item i where 'BP-13:onboarding:' || i.key = min(f.scope)) end as who
    from public.agent_findings f
    where f.resolved_at is null and f.severity in ('critical', 'elevated', 'watch')
      and not (f.scope like 'qa:%' and f.headline like 'Enhancement for %')
    group by f.severity, public.f_finding_family(f.headline)
  ), ig as (
    select 'ig|' || i.severity || '|' || regexp_replace(i.issue_key, '[:|].*$', '') as key, 'issue_group', i.severity,
           case when count(*) = 1 then min(i.issue)
                else count(*) || ' issues of kind "' || regexp_replace(min(i.issue_key), '[:|].*$', '') || '" — e.g. ' || min(i.issue) end,
           'forensic watchdog', count(*)::int, sum(coalesce(i.dollars, 0)), sum(coalesce(i.pounds, 0)),
           min(i.first_seen_on)::timestamptz, max(i.last_seen_on)::timestamptz,
           (array_agg(i.what_to_do order by i.last_seen_on desc))[1],
           (array_agg(i.drill order by i.last_seen_on desc) filter (where i.drill is not null))[1],
           string_agg(distinct i.who_is_accountable, '; ')
    from public.v_open_issues i where i.needs_a_decision
    group by i.severity, regexp_replace(i.issue_key, '[:|].*$', '')
  ), q as (
    select 'q|' || o.id, 'question', 'elevated', o.question, coalesce(o.area, 'open question'), 1, 0::numeric, coalesce(o.exposure_lb, 0),
           o.first_seen, o.last_seen, coalesce(o.what_is_blocked, o.why_it_matters), null::text, null::text
    from public.open_questions o where o.status = 'open'
  ), pe as (
    select 'pe|' || e.id, 'enhancement', 'watch', coalesce(e.page, '?') || ': ' || coalesce(e.recommendation, e.observation), coalesce(e.raised_by, 'page review'), 1, 0::numeric, 0::numeric,
           e.raised_at, e.raised_at, coalesce(e.why_it_matters, '') || case when e.impact is not null then ' · impact ' || e.impact else '' end || case when e.effort is not null then ' · effort ' || e.effort else '' end,
           e.page, null::text
    from public.page_enhancement e where e.status = 'proposed'
  ), cp as (
    select 'cp|' || c.id, 'correction', coalesce(c.severity, 'elevated'), c.the_issue, coalesce(c.raised_by, 'correction proposal'), coalesce(c.rows_affected, 1)::int, coalesce(c.dollars_affected, 0), coalesce(c.pounds_affected, 0),
           c.raised_at, c.raised_at, c.the_proposal, c.target_object, null::text
    from public.correction_proposal c where c.status = 'proposed'
  ), qe as (
    select 'qe|' || f.id, 'qa_enhancement', 'watch', f.headline, f.agent, 1, 0::numeric, 0::numeric, f.detected_at, f.detected_at, f.detail, f.drill_to, null::text
    from public.agent_findings f where f.resolved_at is null and f.scope like 'qa:%' and f.headline like 'Enhancement for %'
  ), u as (
    select * from fg union all select * from ig union all select * from q union all select * from pe union all select * from cp union all select * from qe
  ), deferred as (
    select distinct on (d.key) d.key, d.due_by from public.decisions d
    where d.outcome = 'defer' and d.reversed_at is null and d.due_by >= current_date order by d.key, d.decided_at desc
  ), scored as (
    select u.*, extract(day from now() - u.oldest)::int as age_days,
      (case u.severity when 'critical' then 4 when 'elevated' then 2 else 1 end)
        * (1 + ln(1 + u.dollars / 1000.0))
        * (1 + ln(1 + greatest(extract(day from now() - u.oldest), 0)) / 3.0)
        * (case when u.source = 'onboarding' then greatest(coalesce(public.f_rule('today_onboarding_weight'), 1), 1) else 1 end) as score,
      case u.source
        when 'finding_group' then array['owner','executive','admin','manager','dept_head','cfo','hr']
        when 'onboarding' then array['owner','executive','admin','manager','dept_head','cfo','hr']
        when 'report' then array['owner','executive','admin','manager','dept_head','cfo','hr']
        when 'question' then array['owner','executive','admin','manager','dept_head','cfo','hr']
        else array['owner','executive','cfo','admin'] end as may_take,
      case u.source
        when 'finding_group' then '["resolve","assign","defer"]'::jsonb
        when 'onboarding' then '["resolve","assign","defer"]'::jsonb
        when 'report' then '["resolve","assign","defer"]'::jsonb
        when 'issue_group' then '["fix","leave","ignore","assign","defer"]'::jsonb
        when 'question' then '["answer","assign","defer"]'::jsonb
        when 'qa_enhancement' then '["build_now","build_later","no"]'::jsonb
        else '["approved","rejected","deferred"]'::jsonb end as options,
      dd.due_by as deferred_until
    from u left join deferred dd on dd.key = u.key
  ), mine as (
    select * from scored where deferred_until is null and (v_all or r = any(may_take))
  ), ranked as (
    select m.*, row_number() over (order by m.score desc, m.oldest) as rn,
           row_number() over (partition by m.source order by m.score desc, m.oldest) as rs from mine m
  )
  select jsonb_build_object(
    'as_of', now(), 'role', r, 'sees_all', v_all, 'limit', p_limit,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'key', rk.key, 'source', rk.source, 'severity', rk.severity, 'what', rk.what, 'why', rk.why, 'who', rk.who,
        'n', rk.n, 'dollars', rk.dollars, 'pounds', rk.pounds, 'oldest', rk.oldest, 'newest', rk.newest, 'age_days', rk.age_days,
        'score', round(rk.score::numeric, 2), 'recommendation', rk.recommendation, 'drill_to', rk.drill_to,
        'options', rk.options, 'may_take', to_jsonb(rk.may_take), 'rank', rk.rn, 'in_top', rk.rn <= p_limit, 'source_rank', rk.rs,
        'members', case rk.source
          when 'finding_group' then (select jsonb_agg(jsonb_build_object('id', s.id, 'headline', s.headline, 'dollars', s.dollars, 'at', s.detected_at, 'drill_to', s.drill_to)) from (
              select f.id, f.headline, f.dollars, f.detected_at, f.drill_to from public.agent_findings f
              where f.resolved_at is null and f.severity = rk.severity and public.f_finding_family(f.headline) = rk.what
              order by coalesce(f.dollars, 0) desc, f.detected_at desc limit 5) s)
          when 'report' then (select jsonb_agg(jsonb_build_object('id', s.id, 'headline', s.headline, 'detail', s.detail, 'at', s.detected_at, 'drill_to', s.drill_to)) from (
              select f.id, f.headline, left(f.detail, 600) detail, f.detected_at, f.drill_to from public.agent_findings f
              where f.resolved_at is null and f.severity = rk.severity and public.f_finding_family(f.headline) = rk.what
              order by f.detected_at desc limit 5) s)
          when 'onboarding' then (select jsonb_agg(jsonb_build_object('id', s.id, 'headline', s.headline, 'detail', s.detail, 'at', s.detected_at, 'drill_to', s.drill_to)) from (
              select f.id, f.headline, left(f.detail, 600) detail, f.detected_at, f.drill_to from public.agent_findings f
              where f.resolved_at is null and f.severity = rk.severity and public.f_finding_family(f.headline) = rk.what
              order by f.detected_at desc limit 5) s)
          when 'issue_group' then (select jsonb_agg(jsonb_build_object('issue_key', s.issue_key, 'headline', s.issue, 'dollars', s.dollars, 'at', s.last_seen_on, 'drill_to', s.drill)) from (
              select i.issue_key, i.issue, i.dollars, i.last_seen_on, i.drill from public.v_open_issues i
              where i.needs_a_decision and i.severity = rk.severity and regexp_replace(i.issue_key, '[:|].*$', '') = split_part(rk.key, '|', 3)
              order by coalesce(i.dollars, 0) desc, i.last_seen_on desc limit 5) s)
          else '[]'::jsonb end
      ) order by rk.rn) from ranked rk where rk.rn <= p_limit or rk.rs <= 3), '[]'::jsonb),
    'behind', (select jsonb_build_object('total', count(*), 'shown', least(count(*), p_limit),
                 'by_source', (select jsonb_object_agg(source, n) from (select source, count(*) n from mine group by source) b),
                 'dollars_total', sum(dollars), 'rows_total', sum(n)) from mine),
    'deferred', (select count(*) from scored where deferred_until is not null and (v_all or r = any(may_take))),
    'not_mine', (select count(*) from scored where deferred_until is null and not (v_all or r = any(may_take))),
    'decided_today', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'key', d.key, 'source', d.source, 'what', d.what, 'outcome', d.outcome,
                 'outcome_note', d.outcome_note, 'effect', d.effect, 'decided_role', d.decided_role, 'decided_at', d.decided_at,
                 'reversed_at', d.reversed_at, 'reversal_reason', d.reversal_reason, 'figure', d.figure, 'due_by', d.due_by) order by d.decided_at desc)
                 from public.decisions d where d.decided_at >= (now() at time zone 'America/New_York')::date::timestamp at time zone 'America/New_York'), '[]'::jsonb),
    'push', jsonb_build_object('recipients', (select count(*) from public.alert_recipient where active),
                 'last_sent', (select max(created_at) from public.alert_outbox where source = 'today')))
  into v_out;
  return v_out;
end $function$;

notify pgrst, 'reload schema';;
