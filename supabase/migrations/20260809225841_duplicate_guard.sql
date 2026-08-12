/* Owner, 9 Aug 2026: "REMOVE DUPLICATES AND PUT IN SOMETHING AGAINST DUPLICATES."

   MEASURED FIRST, AND THERE WERE NONE TO REMOVE. metrc_packages showed 7 tags
   appearing twice, which looks exactly like duplication and is not: each appears once
   under MC281714 and once under MP281909 - the same 84g package in transit between
   this company's OWN two licences, the sender seeing 'intransit' and the receiver
   'active'. Deleting either side would have destroyed a real record and broken the
   transfer picture. The identity of a package row is (license, tag), not tag, and on
   that key there are zero duplicates.

   That is the whole lesson: a duplicate is only a duplicate against the right key, and
   "remove duplicates" run blind against the wrong one is a data-loss event. So this
   registers the KEY for each table alongside the check.

   Every sync-target table already carries a unique index. What did NOT exist was
   anything that would notice if a future one shipped without, or if duplicates
   appeared anyway - so that is what this adds. */
create table if not exists public.duplicate_key (
  table_name text primary key,
  key_columns text[] not null,
  why text not null
);
comment on table public.duplicate_key is
  'The natural key of each sync-target table - what makes a row THE SAME ROW. Checked by v_duplicate_audit and by tools/checks/no-duplicate-rows.mjs. Registering the key matters as much as the check: metrc_packages deduped on tag alone would delete legitimate cross-licence transfer records.';

insert into public.duplicate_key (table_name, key_columns, why) values
  ('metrc_packages', array['license','tag'],
   'NOT tag alone. A package in transit between our two licences legitimately appears under both, sender as intransit and receiver as active.'),
  ('metrc_transfers', array['license','id'],
   'Metrc transfer id is unique per licence, and both licences can see the same transfer from opposite ends.'),
  ('metrc_rpt_transfer_manifests', array['licence','manifest_number','direction'],
   'One manifest appears twice by design - outbound for the sender, inbound for the receiver. Direction is part of the identity.'),
  ('product_inventory', array['source_sheet','source_row'],
   'A spreadsheet row is identified by its tab and its row number; the sheet is the source of truth for both.'),
  ('third_party_material', array['metrc_tag','source_row'],
   'Tag can repeat across rows when material is split, so the sheet row disambiguates.'),
  ('apex_raw', array['entity','apex_id','payload_hash'],
   'History is the point: a CHANGED payload must land as a new row, an unchanged one must not.'),
  ('customers', array['state_license'],
   'Licence number is the only stable customer key. Names drift - "Nova Farms LLC" and "Nova Farms, LLC" are one company.')
on conflict (table_name) do update
  set key_columns = excluded.key_columns, why = excluded.why;

alter table public.duplicate_key enable row level security;
drop policy if exists duplicate_key_read on public.duplicate_key;
create policy duplicate_key_read on public.duplicate_key for select to authenticated using (true);

/* The audit. Dynamic, so a table added to duplicate_key is checked with no code
   change - the same reason the sync registry is data. */
create or replace function public.f_duplicate_audit()
returns table (table_name text, key_columns text, dup_groups bigint, extra_rows bigint, unique_indexes bigint)
language plpgsql stable security definer set search_path = public as $$
declare r record; q text; g bigint; x bigint; u bigint;
begin
  for r in select dk.table_name t, dk.key_columns k from public.duplicate_key dk order by dk.table_name loop
    if to_regclass('public.' || quote_ident(r.t)) is null then continue; end if;
    q := format(
      'select coalesce(count(*),0), coalesce(sum(n)-count(*),0) from (select %s, count(*) n from public.%I group by %s having count(*)>1) z',
      array_to_string(array(select quote_ident(c) from unnest(r.k) c), ', '), r.t,
      array_to_string(array(select quote_ident(c) from unnest(r.k) c), ', '));
    execute q into g, x;
    select count(*) into u from pg_indexes i
      where i.schemaname='public' and i.tablename=r.t and i.indexdef ilike '%unique%';
    table_name := r.t; key_columns := array_to_string(r.k, ' + ');
    dup_groups := g; extra_rows := x; unique_indexes := u;
    return next;
  end loop;
end $$;

create or replace view public.v_duplicate_audit as
  select * from public.f_duplicate_audit();
comment on view public.v_duplicate_audit is
  'Duplicate count per sync-target table, against its REGISTERED natural key. dup_groups > 0 or unique_indexes = 0 is a finding.';
grant select on public.v_duplicate_audit to authenticated;;
