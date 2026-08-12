create or replace view v_guard_queue as
select 'overdue' as queue, 10 as rank, s.finding_key as subject,
       coalesce(f.what, s.finding_key) as detail, s.owning_agent as owner, s.due_by as since,
       round(extract(epoch from now() - s.due_by)/3600)::int as hours,
       'past its deadline and still open' as why
from finding_state s
left join v_findings f on f.finding_key = s.finding_key
where s.state in ('open','acknowledged','in_progress') and s.due_by < now()

union all
select 'awaiting second check', 20, c.finding_key, left(c.claim,160), c.proposed_by, c.proposed_at,
       round(extract(epoch from now() - c.proposed_at)/3600)::int,
       'proposed by '||c.proposed_by||', needs a DIFFERENT agent to derive it another way'
from finding_closure c where c.verdict = 'pending'

union all
-- A refused or retracted closure. Both mean the finding is still live and somebody
-- believed otherwise, which is worth a supervisor's eye either way.
select case when c.verdict = 'withdrawn' then 'closure WITHDRAWN' else 'second check DISAGREED' end,
       case when c.verdict = 'withdrawn' then 12 else 5 end,
       c.finding_key, left(coalesce(c.verdict_note, c.claim),160),
       coalesce(c.second_by, c.proposed_by), coalesce(c.second_at, c.proposed_at),
       round(extract(epoch from now() - coalesce(c.second_at, c.proposed_at))/3600)::int,
       case when c.verdict = 'withdrawn'
            then c.proposed_by||' retracted its own closure; the finding is still open'
            else c.proposed_by||' claimed this was resolved and '||coalesce(c.second_by,'the checker')||' could not confirm it'
       end
from finding_closure c where c.verdict in ('disagrees','insufficient','withdrawn')

union all
select 'closed WITHOUT verification', 15, s.finding_key, left(coalesce(s.override_reason,''),160),
       coalesce(s.override_by,'?'), s.override_at,
       round(extract(epoch from now() - coalesce(s.override_at, s.changed_at))/3600)::int,
       'administrator override: closed with no independent check behind it'
from finding_state s where s.override_reason is not null

union all
select 'check has a known defect', 8, d.check_key,
       left(d.claimed||' -- actually: '||d.actually,160), d.found_by, d.found_at,
       round(extract(epoch from now() - d.found_at)/3600)::int,
       d.defect_kind||' causing '||d.impact||'; every reading from this check is suspect until fixed'
from check_defect d where d.fixed_at is null

union all
select 'check never proven to fail', 40, c.checker_key, coalesce(c.title, c.checker_key),
       coalesce(c.runs_where,'?'), null::timestamptz, null::int,
       'no fixture demonstrates this check failing, so nothing shows it would catch the thing it watches'
from checker_registry c where c.enabled and not coalesce(c.fixture_proves_it_fails,false)

union all
select 'route has no human owner', 50, r.route_key, r.route_key||' -> '||r.owning_agent,
       r.owning_agent, null::timestamptz, null::int,
       'findings on this route reach an agent but escalate to nobody named'
from finding_route r where r.enabled and coalesce(r.human_owner,'') = '';;
