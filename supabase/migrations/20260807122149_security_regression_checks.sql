/* STEP 3 OF 3 — MAKE IT STAY FIXED
   --------------------------------
   The previous revoke pass did not hold because it was an action, not a
   control. It fixed the 177 views that existed that day; the count grew to 215
   and the hole reopened.

   Two checks now run alongside every other verification, hourly. If anyone -
   me, the other agent, or a future one - creates a view or function that anon
   can reach, it raises a finding on the CEO dashboard within the hour.

   pg_trgm's 31 operator-support functions are excluded by owner. They are
   extension internals owned by supabase_admin, carry no SECURITY DEFINER and
   write nothing; revoking them would break trigram indexes. Excluding them by
   OWNER rather than by name means a new dangerous function can never hide
   behind the exemption. */

insert into verification_checks
 (check_key, title, what_it_proves, source_a_label, source_a_sql,
  source_b_label, source_b_sql, tolerance_pct, severity)
values
('anon-cannot-read',
 'No anonymous visitor can read anything in public',
 'The publishable key ships inside the JavaScript bundle, so anon is effectively the internet. It previously read the customer directory, transfer manifests, wholesale money and strain performance. Nothing in public should be readable without signing in.',
 'Relations anon can select from',
 $a$select count(*)::numeric from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','v','m')
        and has_table_privilege('anon', c.oid, 'SELECT')
        and c.relname not in (select object_name from security_anon_allowlist)$a$,
 'Permitted (the allow-list, currently empty)',
 $b$select count(*)::numeric from security_anon_allowlist where object_kind='relation'$b$,
 0, 'critical'),

('anon-cannot-execute',
 'No anonymous visitor can run our functions',
 'anon held EXECUTE on 128 functions, 33 of which write - including one that rolls back a data import and one that approves a column mapping without review. Extension operator functions owned by supabase_admin are excluded; anything we wrote is not.',
 'Our functions anon can execute',
 $a$select count(*)::numeric from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and pg_get_userbyid(p.proowner) <> 'supabase_admin'
        and has_function_privilege('anon', p.oid, 'EXECUTE')
        and p.proname not in (select object_name from security_anon_allowlist)$a$,
 'Permitted (the allow-list, currently empty)',
 $b$select count(*)::numeric from security_anon_allowlist where object_kind='function'$b$,
 0, 'critical')
on conflict (check_key) do nothing;

select check_key, title from verification_checks where check_key like 'anon%';;
