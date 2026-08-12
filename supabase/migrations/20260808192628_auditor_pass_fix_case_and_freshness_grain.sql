-- TWO DEFECTS IN MY OWN CHECKER, exposed by its first run. Both are instances of
-- the exact failure classes the Auditor exists to catch, which is the argument for
-- having built it.
--
-- DEFECT 1 — FALSE ALARM FROM CASE. It reported "0 of 17 two-source checks agree".
-- Untrue. verification_runs stores 'agree' in lower case and 'DISAGREE' in upper,
-- and the filter compared against 'AGREE', so all 71 agreeing runs were counted as
-- disagreements. The real position is 12 of 17 checks currently disagreeing -- still
-- serious, but not catastrophic. Comparison is now case-insensitive.
--   (The inconsistent vocabulary is itself a defect in the verification framework
--    and will bite anything else filtering that column. Recorded separately.)
--
-- DEFECT 2 — RIGHT CHECK, WRONG GRAIN. It reported metrc_items fresh at 5.4 hours,
-- because it took max(synced_at) across BOTH licences. Per licence: MP281909 synced
-- 5.4 hours ago, MC281714 is 44.7 HOURS STALE. The aggregate hid the stale half --
-- silent failure by aggregation, committed by the freshness checker itself. Now
-- measured per (table, licence), the grain the business actually runs at.
do $$
declare src text; before_len int;
begin
  select p.prosrc into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tg_auditor_pass';
  if src is null then raise exception 'tg_auditor_pass not found.'; end if;
  before_len := length(src);

  src := replace(src,
    'count(distinct check_key) filter (where verdict is distinct from ''AGREE'') as disagreeing',
    'count(distinct check_key) filter (where upper(verdict) <> ''AGREE'') as disagreeing');

  src := replace(src,
    '''detect.mirror_freshness'', ''D1'', ''table'', t.tbl,',
    '''detect.mirror_freshness'', ''D1'', ''mirror'', t.tbl,');

  src := replace(src,
    'from (select ''metrc_items''     as tbl, max(synced_at) as last_sync, count(*) as n from metrc_items
        union all select ''metrc_strains'',   max(synced_at), count(*) from metrc_strains
        union all select ''metrc_locations'', max(synced_at), count(*) from metrc_locations
        union all select ''metrc_packages'',  max(synced_at), count(*) from metrc_packages) t',
    'from (select ''metrc_items / ''||license as tbl, max(synced_at) as last_sync, count(*) as n
             from metrc_items group by license
        union all select ''metrc_strains / ''||license,   max(synced_at), count(*) from metrc_strains   group by license
        union all select ''metrc_locations / ''||license, max(synced_at), count(*) from metrc_locations group by license
        union all select ''metrc_packages / ''||license,  max(synced_at), count(*) from metrc_packages  group by license) t');

  if length(src) = before_len then
    raise exception '%', 'No replacement took effect - the source did not match. Refusing to silently recreate an unchanged function, which would look like a fix.';
  end if;

  execute 'create or replace function public.tg_auditor_pass() '
       || 'returns table(checker text, subject text, verdict text, detail text) '
       || 'language plpgsql security definer set search_path = public, pg_temp as '
       || quote_literal(src);
end $$;

revoke all on function public.tg_auditor_pass() from public, anon;
grant execute on function public.tg_auditor_pass() to authenticated;;
