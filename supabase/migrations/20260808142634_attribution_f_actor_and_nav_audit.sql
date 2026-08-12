-- Owner-directed, 8 Aug 2026. "Who did this?" has never been answerable.
--
-- MEASURED: audit_events holds 3,589 rows and 0 of them carry an actor. Not a few --
-- none. audit_row() sets actor from auth.uid(), which is NULL for anything that is not
-- a signed-in browser session, and every agent, migration and cron job is exactly that.
-- ddl_guard_log shows the same symptom from the same cause: actor reads 'postgres' for
-- every entry, so 13 unresolved security violations have no owner.
--
-- It surfaced concretely today: 529 nav_registry rows were written in 87 seconds at
-- 10:45 and the menu doubled from 272 to 548 enabled pages, with no record of who,
-- why, or how to reverse it. nav_registry was not audited at all.

-- 1 ---------------------------------------------------------------------------------
-- One resolver, tried in order of how much it actually tells you. Text, not uuid: an
-- agent is not a user id, and forcing it into a uuid column is why the field is empty.
create or replace function public.f_actor()
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v text;
begin
  -- A real signed-in human is the best answer available.
  begin
    v := nullif(auth.uid()::text, '');
    if v is not null then return 'user:' || v; end if;
  exception when others then null;  -- no request context; keep going
  end;

  -- An agent that declares itself: `set app.agent = 'agent-b'` on its session.
  begin
    v := nullif(current_setting('app.agent', true), '');
    if v is not null then return 'agent:' || v; end if;
  exception when others then null;
  end;

  -- Connection-level identity. psql, the MCP server and cron each set this differently,
  -- so it is weaker than the above but far better than nothing.
  v := nullif(current_setting('application_name', true), '');
  if v is not null and v not in ('psql', '') then return 'app:' || v; end if;

  return 'role:' || session_user;
end $$;

comment on function public.f_actor() is
  'Best available identity for whoever is acting, as text. Order: signed-in user, '
  'declared agent (set app.agent), application_name, then session role. Added 8 Aug 2026 '
  'because audit_events held 3,589 rows with 0 actors - auth.uid() is null for every '
  'agent, migration and cron job, which is all of them.';

-- 2 ---------------------------------------------------------------------------------
-- Additive. The existing uuid column is kept for genuine auth.uid() values so nothing
-- that reads it breaks; actor_name carries the answer in every other case.
alter table public.audit_events add column if not exists actor_name text;

comment on column public.audit_events.actor_name is
  'Who acted, from f_actor(). The uuid actor column stays for signed-in users and is '
  'null for agents and jobs - which was 3,589 of 3,589 rows before 8 Aug 2026.';

-- 3 ---------------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  rec jsonb;
  uid uuid;
begin
  rec := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  begin
    uid := auth.uid();
  exception when others then uid := null;
  end;
  insert into audit_events(actor, actor_name, entity, entity_id, action, old_value, new_value)
  values (uid, f_actor(), tg_table_name,
          coalesce(rec->>'id', rec->>'key', rec->>'user_id', '?'),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- 4 ---------------------------------------------------------------------------------
-- The table whose 529 unattributed writes started this.
drop trigger if exists nav_registry_audit on public.nav_registry;
create trigger nav_registry_audit
  after insert or update or delete on public.nav_registry
  for each row execute function public.audit_row();;
