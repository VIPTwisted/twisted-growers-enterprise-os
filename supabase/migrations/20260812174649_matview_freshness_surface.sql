-- Agent W, 12 Aug 2026.
-- agent_registry row maint:dashboards is enabled, expects to run every 10 minutes, and its
-- verified_by reads "matview age against now()" -- the exact check that would have caught
-- every dashboard fault of the last week. Its evidence_table was NULL, so the check that
-- was supposed to exist had nowhere to write and nobody could tell. This is that table.
--
-- It reports three separable states, and never confuses them:
--   measurable + scheduled   -> a real age and a verdict
--   measurable + unscheduled -> an age, and the fact that nothing will ever refresh it
--   unmeasurable             -> NO AGE AT ALL, stated plainly, because you cannot breach
--                               a freshness SLO you have no clock for.
create or replace function f_matview_freshness()
returns table(
  matview text,
  has_clock boolean,
  computed_at timestamptz,
  age interval,
  scheduled_refresh text,
  verdict text
)
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  r record;
  v_at timestamptz;
begin
  for r in
    with reach as (
      select j.jobname, j.schedule, j.command as txt from cron.job j where j.active
      union all
      select j.jobname, j.schedule, pg_get_functiondef(p.oid)
      from cron.job j
      join pg_proc p on j.command like '%'||p.proname||'%'
      join pg_namespace pn on pn.oid=p.pronamespace and pn.nspname='public'
      where j.active
    )
    select c.oid, c.relname,
           exists(select 1 from pg_attribute a
                  where a.attrelid=c.oid and a.attname='computed_at'
                    and a.attnum>0 and not a.attisdropped) as has_clock,
           (select string_agg(distinct x.jobname||' ['||x.schedule||']', ', ')
              from reach x
             where x.txt ~ ('refresh\s+materialized\s+view\s+(concurrently\s+)?(public\.)?'||c.relname||'\M')
           ) as sched
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='m'
    order by c.relname
  loop
    v_at := null;
    if r.has_clock then
      execute format('select max(computed_at) from public.%I', r.relname) into v_at;
    end if;

    matview           := r.relname;
    has_clock         := r.has_clock;
    computed_at       := v_at;
    age               := case when v_at is null then null else now() - v_at end;
    scheduled_refresh := coalesce(r.sched, 'NONE');
    verdict := case
      when not r.has_clock and r.sched is null then 'NO CLOCK AND NO REFRESH'
      when not r.has_clock                      then 'AGE UNMEASURABLE - no computed_at'
      when r.sched is null                      then 'NO SCHEDULED REFRESH'
      else f_matview_freshness_verdict(v_at, now(), interval '30 minutes')
    end;
    return next;
  end loop;
end;
$function$;

create or replace view v_matview_freshness as select * from f_matview_freshness();

grant select on v_matview_freshness to authenticated, service_role, tg_desktop_reader;

comment on view v_matview_freshness is
  'Every materialised view, its age, and whether anything is scheduled to refresh it. '
  'Evidence table for agent_registry maint:dashboards, whose verified_by is "matview age '
  'against now()" and which had no evidence table at all until 12 Aug 2026. A matview with '
  'no computed_at reports NO age rather than a reassuring one. Agent W.';

-- close the fault: the agent now has somewhere to write
update agent_registry
   set evidence_table = 'v_matview_freshness'
 where agent_key = 'maint:dashboards' and evidence_table is null;;
