-- Owner 4 Sep 2026: reviewers, watchers, guards, brain, second brain, and loops must actually run.
-- OPERATING_LAWS already says Agents → Reviewers → Watchers → Guard → Deploy.
-- This makes silence a measured fail, not a markdown hope.

insert into public.brain_fact (fact_key, fact, because, source_sql, learned_from)
select
  'mesh-duty-clause-reviewers-watchers-guards-cannot-go-silent',
  'HARD CLAUSE: no finding is SIGNED and no change ships while any enabled review, challenger, verifier, watcher, watchdog, or guard agent is OVERDUE or NEVER RAN. Agents → Reviewers → Watchers → Guard → Deploy. Brain and second brain must log the run. Silence is a defect, not a green light.',
  'Owner 4 Sep 2026: clause will ensure the reviewers and watchers are doing their job as per our setup ai reviewers, guards, monitoring; with brain, second brain, loops. Measured the same hour: 2 review OVERDUE (challenger 679h, recon 388h), 5 watchers OVERDUE, 4 lanes OVERDUE, 3 lanes NEVER RAN. v_loop_health empty. v_watchdog_current empty. Rule ledger: 42 hard rules, 4 enforced.',
  $sql$select agent_key, kind, status, minutes_since_run from v_agent_health where enabled and kind in ('review','watcher','lane') and status in ('OVERDUE','NEVER RAN')$sql$,
  'grok-ceo'
where not exists (
  select 1 from public.brain_fact
  where fact_key = 'mesh-duty-clause-reviewers-watchers-guards-cannot-go-silent'
    and retired_at is null
);

create or replace view public.v_mesh_duty as
select
  h.agent_key,
  h.display_name,
  h.kind,
  h.owner,
  h.status,
  h.enabled,
  h.last_run,
  h.minutes_since_run,
  h.expected_every_mins,
  h.produced,
  h.verified_by,
  h.what_it_watches,
  h.note,
  (h.kind in ('review','lane') and h.agent_key in ('review:challenger','review:reconciliation','lane:V','lane:X','lane:W')) as blocks_ship
from public.v_agent_health h
where h.enabled
  and h.kind in ('review','watcher','lane')
  and h.status in ('OVERDUE','NEVER RAN');

comment on view public.v_mesh_duty is
  'Mesh duty clause. One row per silent reviewer, watcher, or lane. blocks_ship=true means the change cannot be treated as signed.';

grant select on public.v_mesh_duty to authenticated;
revoke all on public.v_mesh_duty from anon;

create or replace function public.f_mesh_is_closed()
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select not exists (
    select 1 from public.v_mesh_duty where blocks_ship
  );
$$;

comment on function public.f_mesh_is_closed() is
  'FALSE while challenger, verifier, watchdog, or recon review is silent. Deploy is not signed.';

revoke all on function public.f_mesh_is_closed() from public, anon;
grant execute on function public.f_mesh_is_closed() to authenticated;

insert into public.agent_findings (
  agent, agent_key, severity, headline, detail, scope, action, fingerprint
)
select
  'Grok CEO',
  'lane:W',
  'critical',
  'Mesh duty clause: reviewers, watchers, and lanes are silent',
  'Owner clause 4 Sep 2026. v_mesh_duty lists every enabled review/watcher/lane that is OVERDUE or NEVER RAN. f_mesh_is_closed() is false until challenger, verifier, watchdog, and recon review log a run. No finding is signed and no change ships while that function is false. Brain / second brain / loops are in the same duty: empty v_loop_health and empty v_watchdog_current is the same class of silence.',
  'platform',
  'Run challenger (review:challenger / lane:X), verifier (lane:V), watchdog (lane:W), recon review. Then re-read f_mesh_is_closed(). Do not treat any in-flight finding as signed until it returns true.',
  'mesh-duty:2026-09-04'
where not exists (
  select 1 from public.agent_findings where fingerprint = 'mesh-duty:2026-09-04'
);
