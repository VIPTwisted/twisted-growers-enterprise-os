-- ============================================================================
-- CHECK: what can an anonymous visitor reach?
--
-- This is the test that would have caught the two most serious findings of
-- 7 August 2026 the day they appeared:
--   * 30 relations returning real rows to `anon` — customers, manifests,
--     wholesale money — while HANDOFF.md claimed "0 views readable".
--   * 33 SECURITY DEFINER functions containing writes, callable by `anon` over
--     the public REST API, including tg_import_undo.
--
-- `anon` is every anonymous visitor: the publishable key ships inside the
-- JavaScript bundle, so anything anon can reach is effectively public.
--
-- EXPECTED RESULT: zero rows. Any row is a finding.
--
-- Run it read-only, from psql or the SQL editor:
--     \i supabase/checks/anon_exposure.sql
--
-- Two known exceptions are listed in the ALLOWED block below and must be
-- justified there, in writing, or removed.
-- ============================================================================

with allowed_relations(relname, why) as (
  values
    -- Remove BOTH of these once the useNav session fix is deployed. The navigation
    -- rail is fetched before sign-in today, so revoking these before the deploy
    -- would empty every menu with no error. See commit 88b00df.
    ('nav_registry',        'TEMPORARY: useNav fetches the menu pre-session. Revoke after the useNav fix is deployed.'),
    ('nav_role_visibility', 'TEMPORARY: same as nav_registry.')
),
allowed_functions(proname, why) as (
  values
    ('__none__', 'No function should be executable by anon. There are no exceptions.')
),

-- 1. Relations anon holds SELECT on ------------------------------------------
exposed_relations as (
  select 'RELATION' as kind,
         c.relname::text as object_name,
         case c.relkind when 'r' then 'table' when 'v' then 'view'
                        when 'm' then 'materialized view' else c.relkind::text end as object_type,
         case when c.relkind = 'm' then 'materialized views cannot carry RLS at all'
              when not c.relrowsecurity then 'RLS IS DISABLED — fully readable'
              else 'RLS on; grant should still be revoked (defence in depth)' end as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','v','m')
    and has_table_privilege('anon', c.oid, 'SELECT')
    and c.relname not in (select relname from allowed_relations)
),

-- 2. Functions anon holds EXECUTE on ----------------------------------------
exposed_functions as (
  select 'FUNCTION' as kind,
         p.proname::text as object_name,
         case when p.prosecdef then 'SECURITY DEFINER' else 'security invoker' end as object_type,
         case
           when p.prosecdef
            and pg_get_functiondef(p.oid) ~* '(insert into|update |delete from|refresh materialized)'
             then 'WRITES, and runs as its owner so RLS does not apply — CRITICAL'
           when p.prosecdef and p.proconfig is null
             then 'SECURITY DEFINER with NO search_path — privilege escalation shape'
           when p.prosecdef then 'runs as its owner, so RLS does not apply'
           else 'readable surface anon should not have'
         end as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.proname not in (select proname from allowed_functions)
    -- Exclude functions that belong to an extension. pg_trgm and pg_net are installed in
    -- public and grant EXECUTE to PUBLIC by default, which adds 31 harmless text-similarity
    -- functions to this list. Reporting them buries the six that matter, and a check that
    -- cries wolf is a check people stop reading. The right fix for those is to move the
    -- extensions out of public (a separate finding), not to flag each function.
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
    )
),

-- 3. Tables with RLS switched off entirely ----------------------------------
rls_off as (
  select 'RLS_OFF' as kind,
         c.relname::text as object_name,
         'table' as object_type,
         'RLS is disabled on a public table' as detail
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),

-- 4. SECURITY DEFINER functions with a mutable search_path ------------------
--    The classic PostgreSQL privilege-escalation pattern, regardless of who can call it.
mutable_path as (
  select 'MUTABLE_SEARCH_PATH' as kind,
         p.proname::text as object_name,
         'SECURITY DEFINER' as object_type,
         'no search_path set — set search_path = public, pg_temp' as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.proconfig is null
)

select * from exposed_relations
union all select * from exposed_functions
union all select * from rls_off
union all select * from mutable_path
order by
  case kind when 'FUNCTION' then 1 when 'RELATION' then 2
            when 'RLS_OFF' then 3 else 4 end,
  object_name;
