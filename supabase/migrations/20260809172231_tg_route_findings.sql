-- Gives every open finding an owning agent and a deadline. Idempotent: a key that
-- already has a state row is left alone, so re-running never resets someone's work.
--
-- On the clock: due_by runs from the moment an owner is NAMED, not from when the
-- finding was first raised. Backdating would mark a two-year backlog overdue on
-- creation and the queue would be meaningless on its first day. How long a finding
-- sat unowned is not hidden - it is reported separately as waited_days, so the
-- backlog age stays visible alongside the responsiveness clock.
create or replace function tg_route_findings(p_by text default 'tg_route_findings')
returns table(source text, routed integer, to_catchall integer)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
begin
  return query
  with candidate as (
    -- pile 1: the unified findings spine
    select f.finding_key,
           f.source::text                       as src,
           coalesce(f.department,'')            as dept,
           coalesce(f.severity,'elevated')      as sev,
           coalesce(f.what,'')                  as headline
    from v_findings f
    where f.resolved_at is null
      and not coalesce(f.is_duplicate,false)
    union all
    -- pile 2: the discrepancy register, which the spine does not carry
    select 'disc:'||d.discrepancy_key,
           'discrepancy',
           coalesce(d.class,''),
           'elevated',
           coalesce(d.subject,'')
    from discrepancy_register d
    where d.resolved_at is null
  ),
  unrouted as (
    select c.* from candidate c
    where not exists (select 1 from finding_state s where s.finding_key = c.finding_key)
  ),
  picked as (
    select u.*,
           (select r.route_key from finding_route r
             where r.enabled
               and (r.applies_to = u.src or r.applies_to = '*')
               and (r.match_department is null or r.match_department = u.dept)
               and (r.match_pattern    is null or u.headline ~* r.match_pattern)
             order by r.priority, r.route_key
             limit 1) as route_key
    from unrouted u
  ),
  ins as (
    insert into finding_state
      (finding_key, state, source, owning_agent, route_key, due_by,
       routed_by, routed_at, changed_by, note)
    select p.finding_key, 'open', p.src, r.owning_agent, r.route_key,
           now() + make_interval(hours => case p.sev
                                            when 'critical' then r.hours_critical
                                            when 'watch'    then r.hours_watch
                                            else                 r.hours_elevated end),
           p_by, now(), p_by,
           'routed to '||r.owning_agent||' by rule '||r.route_key
    from picked p join finding_route r on r.route_key = p.route_key
    returning finding_state.source, finding_state.route_key
  )
  select i.source, count(*)::integer,
         count(*) filter (where i.route_key = 'catchall')::integer
  from ins i group by i.source;
end;
$$;

comment on function tg_route_findings(text) is
  'Assigns an owning agent and a deadline to every open, non-duplicate finding that '
  'has no state row yet. Idempotent. Returns what it routed and how much fell to the '
  'catch-all, which is a routing gap to be closed rather than an acceptable resting place.';;
