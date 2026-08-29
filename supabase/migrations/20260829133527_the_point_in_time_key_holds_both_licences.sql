/* THE POINT-IN-TIME KEY HOLDS BOTH LICENCES.
   Owner, 29 August 2026: APPLY #91. PK becomes (as_of_date, licence_number,
   tag). MP 2026-08-06 must read 648. Arm the certified-match assertion at 0 in
   the same apply.

   THE DEFECT. metrc_rpt_point_in_time was keyed (as_of_date, tag) with no
   licence. The same tag can legitimately appear in BOTH licences' point-in-time
   reports at one instant - our own material in transit between MC281714 and
   MP281909 - and the key could not hold both. Five tags at 2026-08-06 did
   exactly that. tg_map_rest_v1 upserted MP's file onto MC's rows and updated
   every column EXCEPT licence, so what stood was neither export: Active, in the
   Finish Vault, under the CULTIVATION licence, carrying MP's batch id.

   THE IMPORTER IS FIXED IN THE SAME TRANSACTION, and that is not optional. Its
   conflict target was (as_of_date, tag). Changing the key without changing the
   target would make the very next Inventory Point in Time import fail with "no
   unique or exclusion constraint matching the ON CONFLICT specification". The
   licence is also removed from the update set: a row's licence is now part of
   its identity and must never be overwritten by another file.

   THE FUNCTIONS ARE EDITED IN PLACE, NOT RETYPED. Both are fetched with
   pg_get_functiondef and altered by exact string replacement, each target
   verified unique beforehand. Retyping 15 KB of working importer to change two
   lines is how a working importer stops working.

   THE COLUMN IS RENAMED TO licence_number at the owner's instruction, repeated.
   Cost, stated rather than buried: 73 tables in this schema call this column
   `licence` and 87 call it `license`. After this, metrc_rpt_point_in_time is
   the only one of 160 calling it `licence_number`. Views and check constraints
   follow a rename automatically; the two functions that reference it by text do
   not, and both are corrected below.

   NO QUANTITY IS INVENTED. The Inventory Point in Time report has no weight,
   count or unit of measure. The five rows restored and the five inserted carry
   what their own exports say and nothing more.
*/

-- 1 ─ the column, then the key
alter table public.metrc_rpt_point_in_time rename column licence to licence_number;
alter table public.metrc_rpt_point_in_time drop constraint metrc_rpt_point_in_time_pkey;
alter table public.metrc_rpt_point_in_time
  add constraint metrc_rpt_point_in_time_pkey primary key (as_of_date, licence_number, tag);

-- 2 ─ the two functions that reference the column by text, edited in place
do $fix$
declare
  s text;
  n int;
begin
  select pg_get_functiondef(p.oid) into s from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'tg_map_rest_v1';

  n := (length(s) - length(replace(s, 'use_by_date, licence, source_row', ''))) / length('use_by_date, licence, source_row');
  if n <> 1 then raise exception 'tg_map_rest_v1: expected exactly one PIT column list, found %.', n; end if;
  s := replace(s, 'use_by_date, licence, source_row', 'use_by_date, licence_number, source_row');

  n := (length(s) - length(replace(s, 'on conflict (as_of_date, tag) do update set', ''))) / length('on conflict (as_of_date, tag) do update set');
  if n <> 1 then raise exception 'tg_map_rest_v1: expected exactly one (as_of_date, tag) conflict target, found %.', n; end if;
  s := replace(s, 'on conflict (as_of_date, tag) do update set',
                  'on conflict (as_of_date, licence_number, tag) do update set');
  execute s;

  select pg_get_functiondef(p.oid) into s from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'f_inventory_reconciliation';
  n := (length(s) - length(replace(s, 'string_agg(distinct licence,', ''))) / length('string_agg(distinct licence,');
  if n <> 1 then raise exception 'f_inventory_reconciliation: expected one licence reference, found %.', n; end if;
  s := replace(s, 'string_agg(distinct licence,', 'string_agg(distinct licence_number,');
  execute s;
end $fix$;

-- 3 ─ the five rows, and the proof
do $$
declare
  k_as_of    constant date := date '2026-08-06';
  k_mc       constant text := 'MC281714';
  k_mp       constant text := 'MP281909';
  k_mc_batch constant uuid := '3692801b-6bb6-4861-aa85-4f89daf7d383';
  k_mp_batch constant uuid := 'c02c6ff8-5f9f-4999-92a0-af16aed7690c';
  k_tags     constant text[] := array[
    '1A40A030000E5B1000005907','1A40A030000E5B1000005908','1A40A030000E5B1000005909',
    '1A40A030000E5B1000005910','1A40A030000E5B1000005911'];
  k_rows constant jsonb := $j$[
    {"tag":"1A40A030000E5B1000005907","name":"M00004000825: Twisted Growers Glitter Bomb Flower 3.5g","strain":"TG Glitter Bomb"},
    {"tag":"1A40A030000E5B1000005908","name":"M00003389234: Twisted Growers Orange Cream Flower 3.5g","strain":"TG Orange Cream"},
    {"tag":"1A40A030000E5B1000005909","name":"M00003388911: Twisted Growers Gush Mintz Flower 3.5g","strain":"TG Gush Mintz"},
    {"tag":"1A40A030000E5B1000005910","name":"M00003632943: Twisted Growers Lemon Drop Flower 3.5g","strain":"TG Lemon Drop"},
    {"tag":"1A40A030000E5B1000005911","name":"M00003976015: Twisted Growers XJ-13 Flower 3.5g","strain":"TG XJ-13"}
  ]$j$::jsonb;
  v_twice int; v_mixed int; v_mc int; v_mp int;
begin
  /* The MC rows currently hold MP's status, batch and source_row under MC's
     licence. Restored from the MC export, not from the MP row beside them. */
  update metrc_rpt_point_in_time p
     set status_current = 'Transferred',
         import_id      = k_mc_batch,
         source_row     = jsonb_build_object(
           'Type','Package','Tag Number',r->>'tag','Name',r->>'name',
           'Category','Buds','Strain',r->>'strain','Location','Finish Vault',
           'Sublocation','','Expiration Date','','Sell By Date','','Use By Date','',
           'Status Current','Transferred','Plant Location On Date','','Plant Current Location','')
    from jsonb_array_elements(k_rows) as r
   where p.as_of_date = k_as_of and p.licence_number = k_mc and p.tag = r->>'tag';

  insert into metrc_rpt_point_in_time (
    as_of_date, tag, record_type, name, category, strain, location, sublocation,
    status_current, expiration_date, sell_by_date, use_by_date, licence_number,
    source_row, import_id, imported_at)
  select k_as_of, r->>'tag', 'Package', r->>'name', 'Buds', r->>'strain',
         'Finish Vault', '', 'Active', null, null, null, k_mp,
         jsonb_build_object(
           'Type','Package','Tag Number',r->>'tag','Name',r->>'name',
           'Category','Buds','Strain',r->>'strain','Location','Finish Vault',
           'Sublocation','','Expiration Date','','Sell By Date','','Use By Date','',
           'Status Current','Active','Plant Location On Date','','Plant Current Location',''),
         k_mp_batch, now()
  from jsonb_array_elements(k_rows) as r;

  select count(*) into v_twice from (
    select tag from metrc_rpt_point_in_time
     where as_of_date = k_as_of and tag = any (k_tags)
     group by tag having count(*) = 2 and count(distinct licence_number) = 2) x;
  if v_twice <> 5 then
    raise exception 'Expected all five tags twice, once per licence; % qualified. Rolling back.', v_twice;
  end if;

  select count(*) into v_mixed from metrc_rpt_point_in_time
   where as_of_date = k_as_of and tag = any (k_tags)
     and not ((licence_number = k_mc and status_current = 'Transferred'
               and import_id = k_mc_batch and source_row->>'Status Current' = 'Transferred')
           or (licence_number = k_mp and status_current = 'Active'
               and import_id = k_mp_batch and source_row->>'Status Current' = 'Active'));
  if v_mixed <> 0 then
    raise exception '% row(s) still mix one licence''s columns with another''s. Rolling back.', v_mixed;
  end if;

  select count(*) into v_mc from metrc_rpt_point_in_time where as_of_date = k_as_of and licence_number = k_mc;
  select count(*) into v_mp from metrc_rpt_point_in_time where as_of_date = k_as_of and licence_number = k_mp;
  if v_mc <> 4520 or v_mp <> 648 then
    raise exception 'After the fix 2026-08-06 holds MC % and MP %; the two files state 4,520 and 648. Rolling back.', v_mc, v_mp;
  end if;

  raise notice 'Key now (as_of_date, licence_number, tag). 2026-08-06: MC %, MP %.', v_mc, v_mp;
end $$;