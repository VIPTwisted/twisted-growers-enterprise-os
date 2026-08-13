-- Agent I, 12 Aug 2026. DBI-095.
--
-- tg_ratchet_guard refuses any rise and says: "If new debt is genuinely unavoidable, that is a
-- decision for the owner, RECORDED AS SUCH - not an edit to a baseline."
--
-- There was no way to record one. The guard named the correct process and provided no door to it,
-- so the only routes were to leave the deploy blocked or to disable the trigger - and disabling a
-- guard to get past it is the single worst habit this platform exists to prevent. A rule with no
-- compliant path teaches people to break rules.
--
-- THIS BUILDS THE DOOR, and makes it narrow:
--   * one exception row = ONE rise, by an exact amount, consumed on use and never reusable
--   * the reason is mandatory and must be substantial - 60 characters, not "needed"
--   * must_fall_by is mandatory: accepted debt carries a DATE IT COMES BACK DOWN, so accepting
--     it is a deferral and never a pardon
--   * every rise stays visible in v_accepted_debt long after the migration scrolls away
--
-- The guard still refuses every unaccompanied rise, exactly as before. Nothing is relaxed: what
-- was impossible is now possible ONLY with the owner's reason attached to it.
--
-- UNDO: restore the previous tg_ratchet_guard body; drop view v_accepted_debt; drop table
--       ratchet_exception.

create table if not exists ratchet_exception (
  id            bigserial primary key,
  metric_key    text        not null,
  from_baseline int         not null,
  to_baseline   int         not null check (to_baseline > from_baseline),
  why           text        not null check (length(btrim(why)) >= 60),
  approved_by   text        not null,
  approved_at   timestamptz not null default now(),
  must_fall_by  date        not null,
  consumed_at   timestamptz
);
create index if not exists ratchet_exception_open
  on ratchet_exception (metric_key) where consumed_at is null;

alter table ratchet_exception enable row level security;
drop policy if exists rx_read  on ratchet_exception;
drop policy if exists rx_write on ratchet_exception;
create policy rx_read  on ratchet_exception for select to authenticated using (true);
create policy rx_write on ratchet_exception for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table ratchet_exception is
 'The only way a ratchet may rise. One row permits ONE rise by an exact amount and is consumed on '
 'use. why is mandatory and long, approved_by names a person, and must_fall_by is a date the debt '
 'comes back down - so accepting debt is a deferral with a deadline, never a pardon. Built 12 Aug '
 '2026 because the guard demanded an owner decision "recorded as such" and gave no way to record '
 'one, leaving disabling the trigger as the only path - which is the habit this platform exists '
 'to prevent.';

create or replace function public.tg_ratchet_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare x ratchet_exception%rowtype;
begin
  if tg_op = 'UPDATE' and new.baseline > old.baseline then
    select * into x from ratchet_exception
     where metric_key = new.metric_key
       and from_baseline = old.baseline
       and to_baseline = new.baseline
       and consumed_at is null
     order by approved_at limit 1;

    if not found then
      raise exception
        'Ratchet % may not rise: % -> %.', new.metric_key, old.baseline, new.baseline
        using hint = 'This number records debt. It may fall as debt is paid and may never rise. '
                     'If new debt is genuinely unavoidable, that is a decision for the owner, '
                     'recorded as such: insert a ratchet_exception naming this exact rise, why '
                     'it is unavoidable, who approved it, and the date it must fall by. There is '
                     'no other door, and disabling this trigger is not one.';
    end if;

    update ratchet_exception set consumed_at = now() where id = x.id;
    raise notice 'Ratchet % rose % -> % on exception #% approved by %, must fall by %.',
      new.metric_key, old.baseline, new.baseline, x.id, x.approved_by, x.must_fall_by;
  end if;
  return new;
end;
$function$;

create or replace view public.v_accepted_debt as
select x.metric_key, x.from_baseline, x.to_baseline,
       x.to_baseline - x.from_baseline as rose_by,
       b.baseline                      as baseline_now,
       x.why, x.approved_by, x.approved_at, x.must_fall_by,
       (current_date > x.must_fall_by and b.baseline >= x.to_baseline) as overdue,
       case when x.consumed_at is null then 'approved, not yet applied'
            when current_date > x.must_fall_by and b.baseline >= x.to_baseline
                 then 'OVERDUE — accepted as temporary and never paid back'
            when b.baseline < x.to_baseline then 'paid down since'
            else 'accepted, within its deadline' end as state
from ratchet_exception x
left join ratchet_baseline b on b.metric_key = x.metric_key
order by x.approved_at desc;

comment on view public.v_accepted_debt is
 'Every ratchet rise the owner ever approved, why, and whether the deadline to pay it back has '
 'passed. Debt accepted as temporary and then forgotten is how a standard quietly lowers itself; '
 'this makes that visible instead.';;
