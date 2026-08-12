-- ============================================================================
-- STOP THE ONLY DRIFT THAT COMPOUNDS: views that bypass row-level security.
--
-- MEASURED TODAY: 263 leaking views at 14:00, 285 by 23:00. Twenty-two more in nine
-- hours, and it happens every day agents work, because a Postgres view runs as its
-- OWNER unless told otherwise and nothing was telling it otherwise.
--
-- WHY FUNCTIONS DO NOT DRIFT AND VIEWS DO: tg_ddl_guard already AUTO-FIXES new
-- functions -- revokes anon, pins search_path -- so that class has stayed at 0 all day.
-- Views were never in the trigger's remit. Same guard, same mechanism, one object type
-- missing. That is the whole explanation for a 285-view hole.
--
-- WARNING WOULD NOT WORK. The anon function surface reopened FIVE times in one day
-- while the guard warned in the agent's own session every time. Nobody read the
-- warning. That is precisely why functions moved from warn to auto-fix. Views get the
-- same treatment.
--
-- THE SAFETY CONSTRAINT, because four agents are creating views right now:
-- security_invoker = true makes row-level security APPLY, so a view whose base tables
-- have no policy for `authenticated` would start returning ZERO ROWS. Correct
-- behaviour, but it would empty a page mid-build and look like a bug. So the guard
-- auto-secures a view ONLY when every base table it reads already carries a policy.
-- Where a base table has none, it logs the view with the reason and leaves it alone --
-- visible debt with an owner, not a silent surprise.
--
-- Owner ruling, 9 Aug 2026, on how to handle row-level security: "HANDLE AS MICROSOFT,
-- GOOGLE AND QUICKBOOKS WOULD AND SUPERIOR TO THEM." All three ship secure-by-default
-- and make the exception explicit. This does that, and refuses to break a page to do it.
-- ============================================================================

create or replace function tg_ddl_guard()
returns event_trigger language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  r record; problem text; unprotected text;
begin
  for r in select * from pg_event_trigger_ddl_commands() loop
    problem := null;

    if r.command_tag = 'CREATE TABLE' and r.object_type = 'table' then
      /* Warning only, deliberately: RLS cannot be enabled in the same statement as
         CREATE TABLE, so "fixing" it here would make correct work impossible. */
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
                || 'could call it. Revoked from public and anon; granted to authenticated.';
      end if;
      if exists (select 1 from pg_proc p where p.oid=r.objid and p.prosecdef and p.proconfig is null) then
        execute format('alter function %s set search_path = public, pg_temp', r.objid::regprocedure);
        problem := coalesce(problem||' ALSO ','')
                || 'AUTO-FIXED: SECURITY DEFINER with no search_path — the privilege-escalation '
                || 'shape. Pinned to public, pg_temp.';
      end if;

    /* ── NEW 9 Aug 2026 · views ─────────────────────────────────────────────── */
    elsif r.command_tag = 'CREATE VIEW' and r.object_type = 'view' then
      if coalesce((select option_value from pg_class c,
                          pg_options_to_table(c.reloptions)
                   where c.oid = r.objid and option_name = 'security_invoker'), 'false')
         not in ('true','on') then

        /* Which base tables does it read, and does each carry a policy? A view over a
           table with no policy would go EMPTY the moment RLS applies. */
        select string_agg(distinct b.relname, ', ') into unprotected
        from pg_rewrite rw
        join pg_depend d on d.objid = rw.oid and d.classid = 'pg_rewrite'::regclass
        join pg_class b on b.oid = d.refobjid and b.relkind = 'r' and b.oid <> r.objid
        where rw.ev_class = r.objid
          and not exists (select 1 from pg_policy p where p.polrelid = b.oid);

        if unprotected is null then
          execute format('alter view %s set (security_invoker = true)', r.object_identity);
          problem := 'AUTO-FIXED: the view ran as its OWNER, so row-level security on its base '
                  || 'tables did NOT apply — every policy was bypassable by querying the view '
                  || 'instead of the table. Set security_invoker = true. Every base table already '
                  || 'has a policy, so this cannot have emptied anything.';
        else
          problem := 'NOT auto-fixed, and this is DEBT: the view bypasses row-level security, but '
                  || 'these base tables have NO policy at all — ' || unprotected || ' — so '
                  || 'enforcing RLS would return ZERO ROWS and look like a broken page. Add a '
                  || 'policy to those tables, then: alter view ' || r.object_identity
                  || ' set (security_invoker = true);';
        end if;
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

/* CREATE VIEW added to the tag filter. ALTER VIEW is deliberately NOT in it, so the
   auto-fix above cannot re-enter this trigger. */
drop event trigger if exists tg_ddl_guard_trg;
create event trigger tg_ddl_guard_trg on ddl_command_end
  when tag in ('CREATE TABLE','CREATE FUNCTION','CREATE VIEW') execute function tg_ddl_guard();

comment on function tg_ddl_guard() is
'Auto-fixes at creation rather than warning, because five warnings about the anon function surface were ignored in a single day. Functions: revokes anon, pins search_path. Views (added 9 Aug 2026): sets security_invoker = true when every base table already has a policy, and logs it as named debt when one does not — enforcing RLS over an unprotected table would return zero rows and read as a broken page. Tables stay a warning because RLS cannot be enabled in the same statement as CREATE TABLE.';;
