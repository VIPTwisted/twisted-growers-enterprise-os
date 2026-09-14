-- Applied prod 20260905082527. Do not re-apply.
-- Drops two unused blanket policy sets created 4 Sep on a disproved hypothesis.
-- Grok connects as postgres. tg_desktop_reader / grok_writer were not in use (0 sessions).
-- Roles and grants are NOT dropped.
-- After apply: public policies 1773 → 859. leftover_grok = 0.

do $body$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and policyname in (
         'grok_access_owner_ruling_4sep2026',
         'grok_writer_owner_ruling_4sep2026'
       )
  loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  end loop;
end
$body$;
