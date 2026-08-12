create table if not exists ratchet_baseline (
  metric_key text primary key,
  baseline   integer not null check (baseline >= 0),
  set_on     date not null default current_date,
  set_by     text not null,
  what_it_counts text not null check (length(btrim(what_it_counts)) >= 20),
  note       text
);
alter table ratchet_baseline enable row level security;
create policy ratchet_read  on ratchet_baseline for select to authenticated using (true);
create policy ratchet_write on ratchet_baseline for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

-- A ratchet only ratchets if lowering is easy and raising is hard.
create or replace function tg_ratchet_guard()
returns trigger
language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.baseline > old.baseline then
    raise exception
      'Ratchet % may not rise: % -> %.', new.metric_key, old.baseline, new.baseline
      using hint = 'This number records debt. It may fall as debt is paid and may never rise. '
                   'If new debt is genuinely unavoidable, that is a decision for the owner, '
                   'recorded as such - not an edit to a baseline.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ratchet_guard on ratchet_baseline;
create trigger trg_ratchet_guard before update on ratchet_baseline
  for each row execute function tg_ratchet_guard();

insert into ratchet_baseline (metric_key, baseline, set_by, what_it_counts, note)
select 'checkers_without_a_fixture',
       count(*)::int,
       'agent-a 9 Aug 2026',
       'Enabled checkers that nothing proves can fail - no fixture showing them firing on a '
       || 'real violation and staying quiet on a legitimate case.',
       'Set the day the fixture gate went in. Seven defects had been recorded by then and all '
       || 'seven were false alarms, so this number is the size of the risk that produced them. '
       || 'It may fall and may never rise.'
from checker_registry where enabled and grandfathered
on conflict (metric_key) do nothing;

create or replace function tg_check_fixture_ratchet(p_by text default 'cron:fixture-ratchet')
returns table(metric text, baseline integer, actual integer, verdict text)
language plpgsql volatile security invoker set search_path = public, pg_temp
as $$
declare b integer; a integer;
begin
  select r.baseline into b from ratchet_baseline r where r.metric_key='checkers_without_a_fixture';
  select count(*)::int into a from checker_registry where enabled and grandfathered;

  if a > b then
    insert into agent_findings
      (agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
    values ('QA & Independent Verification','critical',
      'Unproven checkers rose from '||b||' to '||a||' - the ratchet has been breached',
      'WHAT: a checker was enabled without a fixture proving it can fail, and grandfathered '
      ||'instead. WHY IT MATTERS: every one of the seven defects recorded on 9 Aug 2026 was a '
      ||'FALSE ALARM at 4x to 15x, and each would have been caught by a fixture demanding the '
      ||'check stay quiet on a legitimate case. This number is the size of that risk and it is '
      ||'growing. HOW DETECTED: checker_registry against ratchet_baseline. '
      ||'RECOMMENDATION: write the fixture, or disable the checker. Do not raise the baseline.',
      a,'checkers','checker_registry',
      'Write the missing fixture or disable the checker',
      'checker_registry','fixture_ratchet_breached')
    on conflict do nothing;
  else
    update agent_findings set resolved_at = now(),
      resolution = 'Unproven checkers are at '||a||' against a baseline of '||b||'.'
    where fingerprint = 'fixture_ratchet_breached' and resolved_at is null;
  end if;

  -- pay down the debt: a baseline may always fall
  if a < b then
    update ratchet_baseline set baseline = a,
      note = coalesce(note,'')||' Lowered to '||a||' on '||current_date||' by '||p_by||'.'
    where metric_key = 'checkers_without_a_fixture';
  end if;

  return query select 'checkers_without_a_fixture'::text, b, a,
    case when a > b then 'BREACHED' when a < b then 'PAID DOWN' else 'holding' end;
end;
$$;;
