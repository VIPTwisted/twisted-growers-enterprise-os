-- ============================================================================
-- tg_reconcile_tiles()  —  rule C2 made testable
--
-- THIS FILE PREVIOUSLY CONTAINED NO SQL. It was a comment block describing a check that existed
-- only in the live database, committed with a message claiming it implemented one. The owner
-- found that on 7 Aug 2026 and was right to be angry: it is the same failure this whole exercise
-- audits — something that claims to be a check and is not. If the database had been lost, this
-- was unrecoverable.
--
-- Root cause: DDL was applied with execute_sql, which Supabase does NOT record in migration
-- history. apply_migration does. Everything from here uses apply_migration, and the DDL lives in
-- the repository as well.
--
-- WHAT IT DOES. "Totals must reconcile to the items. If a tile says 1,943.6 lb, the rows behind
-- it must add to 1,943.6 lb. A total that cannot be reconciled is a bug, not a rounding
-- difference." Nothing tested that, so all 43 tiles were unverified against their own drills.
--
-- Deliberately honest about its limits — it reports four things and does not pretend the last
-- two are failures:
--   FAIL              tile claims a non-zero figure and its drill returns NO rows, or there is
--                     no drill at all (rule C1). A definite bug.
--   RECONCILED        a countable tile equals the row count behind it. Genuinely verified.
--   DISAGREES         a countable tile does not equal its drill row count. Either the drill is a
--                     superset needing a declared filter, or the drill is wrong. CANNOT be
--                     settled without a declared filter per metric, so it is reported, not judged.
--   NEEDS DECLARATION tile is in lb, $, % or days, so a row count cannot verify it.
--
-- On the first run it found "Harvests dried too long": tile 248, drill 56 rows. The TILE WAS
-- RIGHT — 248 matches dry_days > 14, the owner-set rule. The DRILL was wrong, pointing at
-- v_schedule_compliance, which is about pull scheduling. That is why DISAGREES must never be
-- auto-read as "the tile is wrong".
--
-- 35 of 43 tiles cannot be reconciled automatically until a drill filter is declared. That
-- number is the argument for metric_registry.
--
-- Run:  select * from tg_reconcile_tiles() where verdict in ('FAIL','DISAGREES');
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_reconcile_tiles()
 RETURNS TABLE(department text, kpi text, tile_value text, unit text,
               drill_relation text, drill_rows text, verdict text, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r record; n bigint; v numeric;
begin
  for r in
    select m.department::text as dept, m.kpi::text as kpi, m.value as val, coalesce(m.unit,'')::text as un,
           m.drill::text as drill, n2.table_ref::text as rel
    from mv_department_dashboard m
    left join nav_registry n2 on n2.view_key = m.drill
    order by m.department, m.ord
  loop
    -- Rule C1: a tile without a drill is not finished and must not ship.
    if coalesce(r.drill,'') = '' then
      return query select r.dept, r.kpi, r.val::text, r.un, '(none)'::text, '-'::text,
        'FAIL'::text, 'No drill at all. Rule C1: a tile is a CLAIM and must open to the items behind it.'::text;
      continue;
    end if;

    if coalesce(r.rel,'') = '' or not exists (
         select 1 from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
         where ns.nspname='public' and c.relname=r.rel and c.relkind in ('r','v','m')) then
      return query select r.dept, r.kpi, r.val::text, r.un, coalesce(r.rel,'(no table_ref)')::text, '-'::text,
        'UNVERIFIABLE'::text,
        'The drill goes to a screen, not a relation, so the number cannot be reconciled to rows.'::text;
      continue;
    end if;

    execute format('select count(*) from public.%I', r.rel) into n;
    v := r.val;

    -- The hard failure: the tile asserts something exists and the drill shows nothing.
    if v is not null and v <> 0 and n = 0 then
      return query select r.dept, r.kpi, r.val::text, r.un, r.rel, n::text,
        'FAIL'::text,
        'The tile claims a non-zero figure but its drill returns NO rows. Rule C2: a total that cannot be reconciled to items is a bug.'::text;
    elsif v is not null and v = 0 and n > 0 then
      return query select r.dept, r.kpi, r.val::text, r.un, r.rel, n::text,
        'REVIEW'::text,
        'The tile says zero while the drill holds rows. Either the tile filter is wrong or the drill is a superset.'::text;
    elsif r.un = '' and v = n then
      -- A countable tile whose value equals its row count is genuinely reconciled.
      return query select r.dept, r.kpi, r.val::text, r.un, r.rel, n::text,
        'RECONCILED'::text, 'Countable tile equals the row count behind it.'::text;
    elsif r.un = '' then
      return query select r.dept, r.kpi, r.val::text, r.un, r.rel, n::text,
        'DISAGREES'::text,
        'Countable tile does not equal its drill row count. Either the drill is a superset needing a declared filter, or the tile is wrong. Cannot be settled without a declared filter per metric.'::text;
    else
      return query select r.dept, r.kpi, r.val::text, r.un, r.rel, n::text,
        'NEEDS DECLARATION'::text,
        ('Tile is measured in '||r.un||', so a row count cannot verify it. Reconciliation needs a declared column and aggregate per metric.')::text;
    end if;
  end loop;
end $function$;

REVOKE ALL ON FUNCTION public.tg_reconcile_tiles() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tg_reconcile_tiles() TO authenticated;
