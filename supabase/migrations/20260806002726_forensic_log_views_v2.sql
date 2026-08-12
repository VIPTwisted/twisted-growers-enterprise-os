drop view if exists v_watchdog_log cascade;
create view v_watchdog_log as
select
  f.observed_at, f.observed_at::date as observed_on,
  f.severity, f.what, f.where_it_is, f.who_is_accountable, f.when_it_started,
  f.why_it_matters, f.how_it_was_detected, f.what_to_do, f.the_arithmetic,
  f.record_count, f.pounds, f.dollars, f.drill, f.fingerprint,
  f.evidence, f.search_text,
  r.ran_at as sweep_ran_at, r.ran_by as sweep_ran_by, r.duration_ms as sweep_ms,
  f.id as finding_id, r.id as run_id
from watchdog_findings f left join watchdog_runs r on r.id = f.run_id
order by f.observed_at desc, f.severity;

drop view if exists v_watchdog_current cascade;
create view v_watchdog_current as
select * from v_watchdog_log
where run_id = (select max(id) from watchdog_runs)
order by case severity when 'critical' then 1 when 'elevated' then 2 else 3 end, coalesce(dollars,0) desc;

drop view if exists v_watchdog_timeline cascade;
create view v_watchdog_timeline as
select fingerprint,
  min(observed_at)::date as first_seen, max(observed_at)::date as last_seen,
  count(*) as times_observed,
  (max(observed_at)::date - min(observed_at)::date) as days_persisting,
  max(severity) as severity,
  (array_agg(what order by observed_at desc))[1] as latest_state,
  (array_agg(who_is_accountable order by observed_at desc))[1] as accountable,
  max(pounds) as peak_pounds, max(dollars) as peak_dollars,
  (array_agg(drill order by observed_at desc))[1] as drill,
  case when max(observed_at) < now() - interval '2 days'
       then 'RESOLVED - last seen '||max(observed_at)::date
       else 'STILL OPEN after '||(current_date - min(observed_at)::date)||' days' end as status
from watchdog_findings group by fingerprint
order by max(observed_at) desc, max(dollars) desc nulls last;

drop view if exists v_watchdog_runs cascade;
create view v_watchdog_runs as
select ran_at, ran_at::date as ran_on, ran_by, duration_ms,
  findings_raised, round(total_pounds_flagged,1) pounds_flagged,
  round(total_dollars_flagged) dollars_flagged, id as run_id
from watchdog_runs order by ran_at desc;

create or replace function tg_watchdog_search(q text)
returns setof v_watchdog_log language sql stable security definer set search_path=public as $$
  select * from v_watchdog_log
  where to_tsvector('english', coalesce(search_text,'')||' '||what||' '||coalesce(where_it_is,'')||' '||coalesce(who_is_accountable,''))
        @@ plainto_tsquery('english', q)
     or what ilike '%'||q||'%' or coalesce(where_it_is,'') ilike '%'||q||'%'
     or coalesce(evidence::text,'') ilike '%'||q||'%'
  order by observed_at desc;
$$;
grant execute on function tg_watchdog_search(text) to authenticated;

select cron.unschedule('inventory-watch-am');
select cron.unschedule('inventory-watch-pm');
select cron.schedule('watchdog-am', '17 6 * * *', $$select tg_watchdog_forensic();$$);
select cron.schedule('watchdog-pm', '17 13 * * *', $$select tg_watchdog_forensic();$$);;
