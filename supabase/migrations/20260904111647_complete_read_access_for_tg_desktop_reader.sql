-- Grok's reader (tg_desktop_reader) could see 979 of 992 relations and run 318 of 354
-- read-only functions. It reported being "denied tg_inventory_as_of" while re-deriving a
-- figure of mine, which is exactly the review this role exists to do - and it could not.
-- This closes the read gap and nothing else.
--
-- SCOPE, deliberately: SELECT on every relation, EXECUTE on every STABLE or IMMUTABLE
-- function. Postgres volatility is the line - a STABLE/IMMUTABLE function is declared by
-- its author as not writing to the database, so the whole set is safe to hand a reviewer.
--
-- WHAT IS DELIBERATELY NOT GRANTED, and why: the 227 VOLATILE functions in public. That
-- set includes tg_call_function, which fires edge functions - granting it would give a
-- read-only reviewer the ability to trigger Metrc syncs and writes by proxy. A reviewer
-- that can change what it is reviewing is not a reviewer. Nothing here grants INSERT,
-- UPDATE, DELETE, or any privilege to anon or PUBLIC.
--
-- tg_desktop_reader already carries rolbypassrls, so it reads every row regardless of the
-- 859 policies. That was true before this migration and is unchanged by it.

grant usage on schema public to tg_desktop_reader;
grant select on all tables in schema public to tg_desktop_reader;
grant select on all sequences in schema public to tg_desktop_reader;

do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.provolatile in ('s','i')          -- STABLE or IMMUTABLE only. Never VOLATILE.
      and not has_function_privilege('tg_desktop_reader', p.oid, 'EXECUTE')
  loop
    execute format('grant execute on function %s to tg_desktop_reader', f.sig);
    n := n + 1;
  end loop;
  raise notice 'granted execute on % read-only functions', n;
end $$;

-- Future objects, so this does not have to be re-run every time a view is added.
alter default privileges in schema public grant select on tables to tg_desktop_reader;
alter default privileges in schema public grant select on sequences to tg_desktop_reader;

comment on role tg_desktop_reader is
  'Read-only reviewer account (Grok). SELECT on all of public, EXECUTE on STABLE/IMMUTABLE functions only. Deliberately has NO execute on VOLATILE functions - notably tg_call_function - so it cannot trigger syncs or writes by proxy. Carries rolbypassrls, so it sees every row irrespective of policy. Widened 4 Sep 2026 after it was denied tg_inventory_as_of while independently re-deriving a published figure.';