-- THE CERTIFICATE MEASURED THE TRUTH WITH THE MIRROR'S RULER.
-- The 20:41Z packages certificate hashed the export's quantity at THREE decimals -
-- the mirror column is numeric(14,3) - so 25782.1819 (Metrc) and 25782.182 (mirror)
-- hashed the same and 1A40A030000E5B2000009058 was called identical. GPT found the
-- six rounded packages the same evening; the owner asked why the certificate had
-- not. Because it could not: it rounded the source down to the copy before looking.
-- Owner, 12 Sep 2026: "IT IS WORKING HOW DID YOU NOT CATCH THIS."
--
-- Rule: the export side is hashed at Metrc's own precision (four decimals) and the
-- mirror side is formatted to four as well, so a stored value that lost a decimal
-- differs. That row now fails until the precision repair (GPT's batch) lands.

create or replace function f_certify_packages_active(p_license text)
returns table (status text, value text, detail text)
language plpgsql stable security definer set search_path to 'public'
as $$
declare e record; win_start date; n_same int; n_after int; n_diff int; n_missing int; n_extra int; n_outside int; age int; sample text;
begin
  select * into e from metrc_export_digest d where d.license = p_license and d.population = 'packages_active_in_window'
    order by d.as_of desc, d.computed_at desc limit 1;
  if e is null then
    return query select 'WARN', 'no export digest', 'No Packages Inventory export has been digested for '||p_license||'.'; return;
  end if;
  if coalesce(e.digests->>'per_tag','') not like '%qty(4dp)%' then
    return query select 'FAIL', 'digest at wrong precision', 'The latest export digest for '||p_license||' was hashed at '||coalesce(e.digests->>'per_tag','?')||'. Only a four-decimal digest can certify quantity. Re-digest the export.'; return;
  end if;
  win_start := coalesce((e.digests->>'window_start')::date, e.as_of - 729);
  with m as (
    select p.tag,
           md5(p.tag||'|'||to_char(p.quantity,'FM9999999990.0000')||'|'||coalesce(p.uom,'')||'|'||coalesce(p.lab_testing_state,'')||'|'||coalesce(p.location,'')||'|'||coalesce(p.item_name,'')) as h,
           (p.raw->>'LastModified')::timestamptz as last_mod
    from metrc_packages p where p.license = p_license and p.source_state = 'active' and p.packaged_on >= win_start),
  x as (select j.key as tag, j.value as h from jsonb_each_text(e.rows) j)
  select count(*) filter (where m.h = x.h),
         count(*) filter (where m.h <> x.h and m.last_mod > e.snapshot_at),
         count(*) filter (where m.h <> x.h and (m.last_mod is null or m.last_mod <= e.snapshot_at)),
         count(*) filter (where m.tag is null),
         count(*) filter (where x.tag is null),
         string_agg(coalesce(m.tag, x.tag), ', ') filter (where m.tag is null or x.tag is null or (m.h <> x.h and (m.last_mod is null or m.last_mod <= e.snapshot_at)))
    into n_same, n_after, n_diff, n_missing, n_extra, sample
  from m full join x on x.tag = m.tag;
  select count(*) into n_outside from metrc_packages p where p.license = p_license and p.source_state = 'active' and p.packaged_on < win_start;
  age := current_date - e.as_of;
  if n_diff > 0 or n_missing > 0 or n_extra > 0 then
    return query select 'FAIL', n_same||' same · '||n_diff||' differ before snapshot · '||n_missing||' in export not mirror · '||n_extra||' in mirror not export',
      'The '||e.as_of||' export and the mirror disagree on packages the mirror has NOT changed since the export was taken: '||left(coalesce(sample,''),300)||'. Compared at Metrc precision (four decimals; the mirror column is numeric(14,3), so a stored quantity that lost its fourth decimal fails here until the precision repair lands). The certificate does not carry.';
  elsif age > 7 then
    return query select 'WARN', n_same||' same · '||n_after||' changed after snapshot · export '||age||'d old',
      'No disagreement, but the export is '||age||' days old. Pull a fresh Packages Inventory export to renew.';
  else
    return query select 'PASS', n_same||' same · '||n_after||' changed after snapshot · '||n_outside||' older than the report window · export '||age||'d old',
      'CERTIFIED against the '||e.as_of||' Packages Inventory export taken '||to_char(e.snapshot_at at time zone 'UTC','HH24:MI:SS')||'Z ('||coalesce(e.source_file,'?')||'): every in-window active package matches on tag, quantity (four decimals), unit, lab state, location and item; '||n_after||' changed in Metrc after the snapshot and are excluded on that evidence; '||n_outside||' active packages were packaged before '||win_start||' and are outside the report window. Re-computed on the live mirror at '||to_char(now(),'YYYY-MM-DD HH24:MI')||' UTC.';
  end if;
end $$;

-- A standing check for the precision itself, so the next lost decimal is caught by
-- the database and not by another agent: every stored quantity must equal the
-- quantity in the raw Metrc payload it was mapped from.
insert into deployment_check (check_key, section, title, why, kind, severity, expected, status, active, sort_order)
values ('mirror.package_quantity_precision', '4 Data grain', 'Every stored package quantity equals the raw Metrc quantity, to the last decimal',
        'metrc_packages.quantity is numeric(14,3); Metrc carries four decimals. A rounded quantity is a wrong quantity on every weight tile that sums it.',
        'auto', 'NO-GO', '0 rows differ', 'PENDING', true, 46)
on conflict (check_key) do update set title = excluded.title, why = excluded.why, expected = excluded.expected, active = true;

do $$
declare src text; lines text[]; i_ret int; block text[];
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'f_deployment_checks_run_certification';
  if src ~ 'mirror.package_quantity_precision' then return; end if;
  lines := regexp_split_to_array(src, E'\n');
  select min(i) into i_ret from generate_subscripts(lines, 1) i where lines[i] ~ '^\s*return query select r, f, w;';
  if i_ret is null then raise exception 'runner shape not as expected; refusing to edit blind'; end if;
  block := array[
    '  begin',
    '    select count(*), string_agg(tag||'' ''||quantity||''≠''||(raw->>''Quantity''), '', '' order by tag) into n, d',
    '      from metrc_packages where raw->>''Quantity'' is not null and (raw->>''Quantity'')::numeric <> quantity;',
    '    s := case when n = 0 then ''PASS'' else ''FAIL'' end;',
    '    perform f_deployment_check_record(''mirror.package_quantity_precision'', s, n||'' rows differ'', case when s=''PASS'' then ''Every stored quantity equals its raw Metrc quantity.'' else ''Stored quantity lost precision on: ''||left(coalesce(d,''''),400)||''. Column is numeric(14,3); Metrc sends four decimals. Precision repair is in the sync lane (GPT).'' end);',
    '    r:=r+1; if s=''FAIL'' then f:=f+1; end if;',
    '  exception when others then perform f_deployment_check_record(''mirror.package_quantity_precision'',''FAIL'',''error'',left(sqlerrm,200)); r:=r+1; f:=f+1; end;',
    ''];
  execute array_to_string(lines[1:i_ret-1] || block || lines[i_ret:array_length(lines,1)], E'\n');
end $$;
