-- Is this check worth believing? A check with an unfixed defect keeps running and
-- keeps being read; this is the label that says how much weight to put on it.
create or replace view v_check_trust as
select coalesce(d.check_key, c.checker_key)                       as check_key,
       c.title,
       c.enabled,
       coalesce(c.fixture_proves_it_fails,false)                  as proven_it_can_fail,
       count(d.id) filter (where d.fixed_at is null)              as open_defects,
       count(d.id) filter (where d.fixed_at is not null)          as fixed_defects,
       max(d.found_at) filter (where d.fixed_at is null)          as newest_open_defect,
       case
         when count(d.id) filter (where d.fixed_at is null) > 0
           then 'UNTRUSTED - known defect, read its output with the defect in hand'
         when not coalesce(c.fixture_proves_it_fails,false)
           then 'UNPROVEN - nobody has ever watched this check fail, so nobody knows it can'
         else 'trusted'
       end                                                        as trust
from checker_registry c
full outer join check_defect d on d.check_key = c.checker_key
group by coalesce(d.check_key, c.checker_key), c.title, c.enabled, c.fixture_proves_it_fails;

comment on view v_check_trust is
  'The instrument, not the reading. UNPROVEN is not a lesser state than UNTRUSTED - a '
  'check nobody has watched fail may be silently passing forever, which is the '
  'false-green pattern aimed at our own safety net.';


-- Everything the guard must look at, in one list, ordered by how much it matters.
create or replace view v_guard_queue as

-- 1. Work that has blown its deadline.
select 'overdue'                                        as queue,
       10                                               as rank,
       s.finding_key                                    as subject,
       coalesce(f.what, s.finding_key)                  as detail,
       s.owning_agent                                   as owner,
       s.due_by                                         as since,
       round(extract(epoch from now() - s.due_by)/3600)::int as hours,
       'past its deadline and still open'               as why
from finding_state s
left join v_findings f on f.finding_key = s.finding_key
where s.state in ('open','acknowledged','in_progress')
  and s.due_by < now()

union all
-- 2. An agent says it is done and nobody has checked. This is the queue that makes
--    the double check real: without somebody working it, closures simply stall.
select 'awaiting second check', 20, c.finding_key,
       left(c.claim,160), c.proposed_by, c.proposed_at,
       round(extract(epoch from now() - c.proposed_at)/3600)::int,
       'proposed by '||c.proposed_by||', needs a DIFFERENT agent to derive it another way'
from finding_closure c
where c.verdict = 'pending'

union all
-- 3. The second agent disagreed. Someone asserted something untrue.
select 'second check DISAGREED', 5, c.finding_key,
       left(coalesce(c.verdict_note, c.claim),160), coalesce(c.second_by,'?'), c.second_at,
       round(extract(epoch from now() - coalesce(c.second_at, c.proposed_at))/3600)::int,
       c.proposed_by||' claimed this was resolved and '||coalesce(c.second_by,'the checker')||' could not confirm it'
from finding_closure c
where c.verdict in ('disagrees','insufficient')

union all
-- 4. Closed on authority rather than on evidence. Never leaves this list.
select 'closed WITHOUT verification', 15, s.finding_key,
       left(coalesce(s.override_reason,''),160), coalesce(s.override_by,'?'), s.override_at,
       round(extract(epoch from now() - coalesce(s.override_at, s.changed_at))/3600)::int,
       'administrator override: closed with no independent check behind it'
from finding_state s
where s.override_reason is not null

union all
-- 5. Instruments known to be wrong, still running.
select 'check has a known defect', 8, d.check_key,
       left(d.claimed||' -- actually: '||d.actually,160), d.found_by, d.found_at,
       round(extract(epoch from now() - d.found_at)/3600)::int,
       d.defect_kind||' causing '||d.impact||'; every reading from this check is suspect until fixed'
from check_defect d
where d.fixed_at is null

union all
-- 6. Instruments nobody has ever watched fail.
select 'check never proven to fail', 40, c.checker_key,
       coalesce(c.title, c.checker_key), coalesce(c.runs_where,'?'), null::timestamptz, null::int,
       'no fixture demonstrates this check failing, so nothing shows it would catch the thing it watches'
from checker_registry c
where c.enabled and not coalesce(c.fixture_proves_it_fails,false)

union all
-- 7. Routes that reach an agent but no person.
select 'route has no human owner', 50, r.route_key,
       r.route_key||' -> '||r.owning_agent, r.owning_agent, null::timestamptz, null::int,
       'findings on this route reach an agent but escalate to nobody named'
from finding_route r
where r.enabled and coalesce(r.human_owner,'') = '';

comment on view v_guard_queue is
  'The supervisor list. Overdue work, closures nobody has checked, closures a second '
  'agent refused, closures forced through by an administrator, checks known to be '
  'broken, checks never proven to work, and routes that reach no person. Ordered by '
  'rank: the lower the number, the worse it is.';;
