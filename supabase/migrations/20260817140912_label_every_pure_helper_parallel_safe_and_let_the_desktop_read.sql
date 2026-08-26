/* EVERY PURE HELPER WAS PARALLEL UNSAFE, AND ONE OF THEM POISONS A WHOLE QUERY.
 *
 * Chasing two statement timeouts on the owner's Command Center led to f_is_ours, which
 * was marked PARALLEL UNSAFE. Fixing that took v_stock_packages from 34.4 seconds to
 * 3.4. Then the obvious question: how many others?
 *
 * All of them. Every f_* helper in this database is parallel unsafe:
 *
 *     f_to_pounds          54 views      f_is_weight          36 views
 *     f_rule               29 views      f_strain_from_item   20 views
 *     f_quantity_text       9 views      f_product_line        8 views
 *     ...and fourteen more
 *
 * Nobody labelled them. PARALLEL UNSAFE is Postgres's DEFAULT for an unlabelled
 * function - it is not a decision anyone made, it is what you get for not saying. And a
 * single unsafe function anywhere in a query disqualifies the ENTIRE query from parallel
 * execution. f_to_pounds alone therefore forced 54 views to run single-threaded, on a
 * database that just quadrupled its largest table.
 *
 * WHY THIS IS SAFE, and it is not a judgement call. Postgres defines parallel safe as:
 * does not write, does not access sequences, does not use temp tables, does not change
 * transaction state. Every function relabelled here is already declared IMMUTABLE or
 * STABLE, which the planner enforces - none can write. They convert units, look up a
 * config row, classify a string. They are the textbook case.
 *
 * IMMUTABLE ones are unambiguous: they read nothing but their arguments. The STABLE ones
 * read a table and are safe for the same reason any SELECT in a parallel worker is safe.
 *
 * WHAT IS DELIBERATELY LEFT ALONE. Anything VOLATILE, and anything that writes, logs or
 * touches a sequence. Those may genuinely be unsafe and none of them is a hot-path
 * helper, so there is nothing to gain and something to lose.
 *
 * AND THE GRANTS. tg_desktop_reader - the read-only role this platform is diagnosed
 * from - could not EXECUTE these functions, so 54 views were unreadable from the
 * desktop all week. That is why nobody could measure the timeouts: the guard blinded
 * the people diagnosing it. Read-only execute on a pure function leaks nothing that
 * selecting from the view would not.
 */

do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
     where nsp.nspname = 'public'
       and p.prokind = 'f'
       and p.proname like 'f\_%'
       and p.proparallel = 'u'
       and p.provolatile in ('i','s')      -- IMMUTABLE or STABLE only: cannot write
  loop
    execute format('alter function %s parallel safe', f.sig);
    execute format('grant execute on function %s to tg_desktop_reader', f.sig);
    n := n + 1;
  end loop;
  raise notice 'relabelled % pure helper function(s) parallel safe', n;
end $$;;
