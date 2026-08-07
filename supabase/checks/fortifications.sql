-- ============================================================================
-- FORTIFICATIONS — the guards that prevent rather than detect
--
-- THIS FILE PREVIOUSLY CONTAINED NO SQL. It described these guards while they existed only in
-- the live database. Fixed here. The pattern recurred SIX times on 7 Aug 2026 — production code
-- untracked, seven comment-only check files, 241 tables against 6 migrations, the training layer
-- untracked, and twice more in this file's own history. Work in exactly one place, with confident
-- documentation asserting otherwise.
--
-- Apply with apply_migration, never execute_sql — Supabase records the former in migration
-- history and not the latter, which is how the schema came to exist only in production.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · DDL GUARD — auto-fixes at creation
--
-- The anon function surface reopened FIVE times in one day. The guard caught all five and warned
-- the agent, in their own session, at creation. Nobody read the warning. Five warnings, zero
-- fixes — so warning is the wrong mechanism.
--
-- For FUNCTIONS it was always the wrong mechanism. Postgres grants EXECUTE to PUBLIC on every new
-- function, and revoking that is ALWAYS correct: a role which genuinely needs it gets an explicit
-- grant. So the guard now fixes it rather than mentioning it.
--
-- For TABLES it stays a warning, and that asymmetry is deliberate: RLS cannot be enabled in the
-- same statement as CREATE TABLE, so "fixing" it here would make correct work impossible.
--
-- Proven: created a bare function specifying no grants, and anon could not call it while
-- authenticated could. The Postgres default no longer wins.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists ddl_guard_log (
  id              bigserial primary key,
  noticed_at      timestamptz not null default now(),
  object_type     text,
  object_identity text,
  command_tag     text,
  problem         text,
  actor           text,
  resolved_at     timestamptz
);
alter table ddl_guard_log enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid='public.ddl_guard_log'::regclass and polname='dgl_read') then
    create policy dgl_read on ddl_guard_log for select to authenticated using (true);
  end if;
end $$;

create or replace function tg_ddl_guard()
returns event_trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare r record; problem text; fixed int := 0;
begin
  for r in select * from pg_event_trigger_ddl_commands() loop
    problem := null;

    if r.command_tag = 'CREATE TABLE' and r.object_type = 'table' then
      -- Warning only, deliberately: RLS cannot be enabled in the same statement as CREATE TABLE.
      if not exists (select 1 from pg_class c where c.oid = r.objid and c.relrowsecurity) then
        problem := 'Table created WITHOUT row-level security. Run: alter table '||r.object_identity
                || ' enable row level security; then add policies mirroring a sibling table.';
      end if;

    elsif r.command_tag = 'CREATE FUNCTION' and r.object_type = 'function' then
      if exists (select 1 from pg_proc p where p.oid = r.objid
                 and has_function_privilege('anon', p.oid, 'EXECUTE')) then
        execute format('revoke all on function %s from public, anon', r.objid::regprocedure);
        execute format('grant execute on function %s to authenticated', r.objid::regprocedure);
        problem := 'AUTO-FIXED: EXECUTE was granted to PUBLIC (the Postgres default), so anon '
                || 'could call it. Revoked from public and anon; granted to authenticated. If '
                || 'this must not be callable by signed-in users either, revoke it explicitly.';
        fixed := fixed + 1;
      end if;

      if exists (select 1 from pg_proc p where p.oid=r.objid and p.prosecdef and p.proconfig is null) then
        execute format('alter function %s set search_path = public, pg_temp', r.objid::regprocedure);
        problem := coalesce(problem||' ALSO ','')
                || 'AUTO-FIXED: SECURITY DEFINER with no search_path — the privilege-escalation '
                || 'shape. Pinned to public, pg_temp.';
        fixed := fixed + 1;
      end if;
    end if;

    if problem is not null then
      insert into ddl_guard_log (object_type, object_identity, command_tag, problem, actor)
      values (r.object_type, r.object_identity, r.command_tag, problem,
              coalesce(current_setting('request.jwt.claim.email', true), session_user));
      raise warning E'\n>>> TG DDL GUARD: %\n>>> %\n', r.object_identity, problem;
    end if;
  end loop;
end $function$;

drop event trigger if exists tg_ddl_guard_trg;
create event trigger tg_ddl_guard_trg on ddl_command_end
  when tag in ('CREATE TABLE','CREATE FUNCTION') execute function tg_ddl_guard();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · RULE H2 — enforced by trigger, not by policy absence
--
-- H2 was enforced only by the ABSENCE of a delete policy, and RLS does not apply to a
-- SECURITY DEFINER function or to the table owner. That is exactly how watchdog_findings lost 57
-- rows on 7 Aug 2026 despite the rule. A trigger applies to every caller.
--
-- Proven: the delete is refused even running as the table owner.
--
-- The escape is deliberate and loud. A rule with no legitimate exception gets worked around
-- silently; one with a recorded exception gets used correctly. It requires a valid reason CODE,
-- forty characters of explanation and a named second approver, and writes all three to
-- audit_events.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function tg_block_forensic_delete()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_code text; v_note text; v_appr text;
begin
  v_code := coalesce(current_setting('tg.forensic_delete_code', true), '');
  v_note := coalesce(current_setting('tg.forensic_delete_note', true), '');
  v_appr := coalesce(current_setting('tg.forensic_delete_approver', true), '');

  if v_code = '' and v_note = '' then
    raise exception '%', 'RULE H2: ' || tg_table_name ||
      ' is an append-only forensic record and cannot be deleted.' || chr(10) ||
      'It is evidence of what the business knew and when. Append a reversing row instead.' || chr(10) ||
      'If a uniqueness constraint genuinely requires removing duplicates, record the decision ' ||
      'in issue_decisions first, then set all three of:' || chr(10) ||
      '  set local tg.forensic_delete_code     = ''DUPLICATE_CONSTRAINT'';' || chr(10) ||
      '  set local tg.forensic_delete_note     = ''<at least 40 characters saying why>'';' || chr(10) ||
      '  set local tg.forensic_delete_approver = ''<who agreed>'';' || chr(10) ||
      'Valid codes are in Settings > Reason Codes (v_reason_settings).'
      using errcode = 'check_violation';
  end if;

  perform f_check_reason('forensic_delete', v_code, v_note, null, v_appr);

  insert into audit_events (actor, entity, entity_id, action, old_value, reason)
  values (coalesce(current_setting('request.jwt.claim.email', true), session_user),
          tg_table_name, coalesce(to_jsonb(old)->>'id','?'), 'forensic_delete_allowed',
          to_jsonb(old), v_code || ' | ' || v_note || ' | approved by ' || v_appr);
  return old;
end $function$;

do $$
declare t text;
begin
  foreach t in array array['watchdog_findings','issue_decisions','cost_input_history',
                           'metrc_corrections','moisture_loss_entries','platform_state']
  loop
    execute format('drop trigger if exists trg_h2_no_delete on public.%I', t);
    execute format('create trigger trg_h2_no_delete before delete on public.%I
                    for each row execute function tg_block_forensic_delete()', t);
  end loop;
end $$;
