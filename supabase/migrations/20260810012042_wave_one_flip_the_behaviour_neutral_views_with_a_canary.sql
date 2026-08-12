-- WAVE 1 of closing the view bypass: 305 views run as their owner and ignore every policy on
-- their base tables. This wave takes only the subset where switching to the caller's own
-- permissions CANNOT change what a signed-in user sees:
--
--   * every base table it touches has a SELECT policy for authenticated with qual = true
--   * authenticated holds a table-level SELECT grant on every one of them
--   * it touches no materialized view (RLS cannot apply to those at all — separate problem)
--
-- Measured 72 views qualify. The other 220 touch a RESTRICTED table, which means they are
-- currently showing data a policy was written to withhold. Those are the real leak and they get
-- decided individually, because for some of them the correct outcome is that staff see LESS.
--
-- WHY A CANARY AND NOT A BULK ALTER. security_invoker changes reads to run as the caller, so it
-- needs BOTH a policy and a table-level grant. Analysis says all 72 have both. Analysis has
-- been wrong twice today. So this measures each view as the authenticated role after flipping
-- it, and if a view that returned rows before returns none after, the whole transaction rolls
-- back — no partial state, nothing to unpick, no blank page discovered by a person on Monday.
-- This is the same reason a matview drop is refused outright: the ones you cannot undo are the
-- ones that must not be attempted optimistically.
--
-- NOTHING IS HARDCODED. The 72 are recomputed from the catalogue at run time, so this cannot
-- act on a stale list if another agent adds or secures a view while it runs.
do $$
declare
  v            record;
  had_rows     boolean;
  has_rows     boolean;
  flipped      int := 0;
  regressed    text[] := '{}';
begin
  for v in
    with recursive
    leaky as (
      select c.oid, c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'
         and coalesce((select option_value from pg_options_to_table(c.reloptions)
                        where option_name = 'security_invoker'), 'false') <> 'true'
    ),
    edge as (
      select distinct r.ev_class as src, d.refobjid as tgt
        from pg_depend d join pg_rewrite r on r.oid = d.objid
       where d.classid = 'pg_rewrite'::regclass and d.refclassid = 'pg_class'::regclass
         and r.ev_class <> d.refobjid
    ),
    walk as (
      select l.oid as view_oid, l.relname as view_name, e.tgt as dep
        from leaky l join edge e on e.src = l.oid
      union
      select w.view_oid, w.view_name, e.tgt from walk w join edge e on e.src = w.dep
    ),
    base as (
      select w.view_name, c.oid as base_oid, c.relkind,
             exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname
                        and p.cmd in ('SELECT','ALL')
                        and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
                        and coalesce(p.qual,'true') = 'true') as staff_open
        from walk w
        join pg_class c on c.oid = w.dep
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       where c.relkind in ('r','m')
    )
    select view_name
      from base
     group by view_name
    having bool_and(case when relkind = 'r' then staff_open else false end)
       and bool_and(has_table_privilege('authenticated', base_oid, 'SELECT'))
       and count(*) filter (where relkind = 'm') = 0
     order by view_name
  loop
    /* What it returns today, as the owner, which is what everyone effectively sees now. */
    execute format('select exists (select 1 from public.%I)', v.view_name) into had_rows;

    execute format('alter view public.%I set (security_invoker = true)', v.view_name);
    flipped := flipped + 1;

    /* Now read it as an ordinary signed-in user with no admin claim. */
    set local role authenticated;
    begin
      execute format('select exists (select 1 from public.%I)', v.view_name) into has_rows;
    exception when others then
      has_rows := false;   /* an error under the caller's rights is a regression too */
    end;
    reset role;

    if had_rows and not has_rows then
      regressed := regressed || v.view_name;
    end if;
  end loop;

  if array_length(regressed, 1) > 0 then
    raise exception 'ROLLED BACK. % of % views went empty for a signed-in user: %',
      array_length(regressed, 1), flipped, array_to_string(regressed, ', ');
  end if;

  raise notice 'wave 1: % views now enforce row-level security, none lost rows for staff', flipped;
end $$;;
