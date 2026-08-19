/* THE 29 POLICIES THE FIRST WRAP MISSED — is_finance_reader() was not in the
 * whitelist, and its per-row evaluation over the 19k-row transfer report just
 * timed out the Sales dashboard's Metrc declared-price road. Same class
 * (zero-argument, stable), same provably-safe mechanical wrap, same audit
 * trail in policy_wrap_log. */
do $$
declare r record; new_qual text; n int := 0;
begin
  for r in
    select p.polname, c.relname, pg_get_expr(p.polqual, p.polrelid) as qual
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n2 on n2.oid = c.relnamespace
    where n2.nspname='public'
      and pg_get_expr(p.polqual, p.polrelid) ~ '\mis_finance_reader\(\)'
      and pg_get_expr(p.polqual, p.polrelid) !~* 'select'
  loop
    new_qual := regexp_replace(r.qual, '\mis_finance_reader\(\)', '(select is_finance_reader())', 'g');
    execute format('alter policy %I on public.%I using (%s)', r.polname, r.relname, new_qual);
    insert into policy_wrap_log (relname, polname, before_qual, after_qual)
    values (r.relname, r.polname, r.qual, new_qual);
    n := n + 1;
  end loop;
  raise notice 'wrapped % is_finance_reader policies', n;
end $$;;
