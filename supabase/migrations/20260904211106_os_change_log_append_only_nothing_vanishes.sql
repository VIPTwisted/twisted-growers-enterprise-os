-- Owner 4 Sep 2026: anything you remove or change keep log of in case I need it back or need to review it.
create table if not exists public.os_change_log (
  id              bigserial primary key,
  at              timestamptz not null default now(),
  by_agent        text not null,
  action          text not null check (action in ('rebind','relabel','retire','disable','enable','sql','nav','file','restore')),
  object_kind     text not null,
  object_key      text not null,
  old_definition  text,
  new_definition  text,
  why             text not null,
  restore_how     text not null,
  ticket          text,
  reversible      boolean not null default true
);

create index if not exists os_change_log_object_idx on public.os_change_log (object_kind, object_key, at desc);

create or replace function public.tg_os_change_log_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'os_change_log is append-only. Correct a row by inserting action=restore that names id %.', old.id;
end;
$$;

drop trigger if exists trg_os_change_log_no_update on public.os_change_log;
create trigger trg_os_change_log_no_update
  before update or delete on public.os_change_log
  for each row execute function public.tg_os_change_log_append_only();

comment on table public.os_change_log is
  'Append-only. Every rebind, relabel, retire, disable, or SQL change must insert here with old_definition and restore_how before the change ships. Owner 4 Sep 2026.';

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
values
(
  'grok-ceo',
  'sql',
  'table',
  'os_change_log',
  'did not exist',
  'append-only change log created',
  'Owner: anything you remove or change keep log of in case I need it back or need to review it.',
  'drop table public.os_change_log cascade; drop function public.tg_os_change_log_append_only(); retire brain_fact change-log-nothing-vanishes',
  'owner-2026-09-04-changelog'
);

insert into public.brain_fact (fact_key, fact, because, source_sql, learned_from)
select
  'change-log-nothing-vanishes',
  'CHANGE LOG HARD RULE (owner 4 Sep 2026). Nothing is removed, rebound, relabelled, disabled, or SQL-replaced without an insert into os_change_log first: old_definition, new_definition, why, restore_how. The table is append-only — UPDATE/DELETE raise. A restore is a new row with action=restore that names the prior id. Tiles and KPIs are not deleted (omit-nothing). Rebinds (e.g. v_control_tower pointing at live Metrc/Apex instead of empty OS tables) MUST log the previous view body so it can be put back. Git history is not enough; the owner reviews from this table.',
  'Owner 4 Sep 2026: anything you remove or change keep log of in case I need it back or need to review it.',
  $sql$select id, at, action, object_key from os_change_log order by at desc limit 20$sql$,
  'grok-ceo'
where not exists (
  select 1 from public.brain_fact where fact_key = 'change-log-nothing-vanishes' and retired_at is null
);
