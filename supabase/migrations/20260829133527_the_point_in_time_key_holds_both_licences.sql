/* THE POINT-IN-TIME KEY MUST HOLD BOTH LICENCES.
   Owner ticket, 29 August 2026. NOT APPLIED — held for APPLY.

   ─────────────────────────────────────────────────────────────────────────────
   THE DEFECT, AND IT IS NOT "FIVE MISSING ROWS".

   metrc_rpt_point_in_time is keyed (as_of_date, tag). No licence. The same tag
   can legitimately appear in BOTH licences' point-in-time reports at the same
   instant — that is what our own material in transit between MC281714 and
   MP281909 looks like at a snapshot — and the key cannot hold both.

   On 2026-08-06 five tags do exactly that:

     1A40A030000E5B1000005907  1A40A030000E5B1000005908
     1A40A030000E5B1000005909  1A40A030000E5B1000005910
     1A40A030000E5B1000005911

   The MC file says Transferred: cultivation had shipped them out.
   The MP file says Active:      manufacturing was holding them.
   Both are true. Both are needed.

   The MP import upserted onto the MC rows and updated every column EXCEPT
   licence. What stands in the table today is neither file:

     licence         MC281714   (from the MC import)
     status_current  Active     (from the MP import)
     import_id       MP's batch (from the MP import)
     source_row      MP's row   (from the MP import)

   Read plainly, the table asserts that these five packages were ACTIVE IN THE
   FINISH VAULT UNDER THE CULTIVATION LICENCE. Neither file says that. It is a
   fabricated combination — not invented values, an invented row.

   Both errors point the same way on a certified as-of: MP281909 understated by
   five tags, MC281714 overstated by five it had already shipped.

   AND IT RECURS. Every as-of where both licences are pulled and anything is in
   transit will do this again, silently. It will bite on the first MP file for
   any close.

   ─────────────────────────────────────────────────────────────────────────────
   MEASURED BEFORE WRITING, read-only against production, 29 Aug 2026:

     rows that would violate the new key (as_of_date, licence, tag)   0
     rows with a NULL licence, which the new key cannot take          0
     foreign keys depending on the current primary key                0

   So the key can change without losing a row and without breaking a reference.

   ─────────────────────────────────────────────────────────────────────────────
   A NOTE ON THE COLUMN NAME. The ticket says `licence_number`. The column on
   this table is `licence`, and that is what is used here. Renaming it is a
   separate change with its own blast radius; inventing a second name for the
   same thing is how a schema drifts.

   THE LICENCE IS THE FILE'S, NEVER INFERRED FROM THE TAG PREFIX. Every tag in
   this incident carries the 1A40A030000E5B10 prefix and appears under BOTH
   licences, which is precisely why a prefix cannot decide ownership. The
   licence written below is the licence of the export the row came from.

   TO REVERSE:
     delete from metrc_rpt_point_in_time
      where as_of_date = date '2026-08-06' and licence = 'MP281909'
        and import_id = 'c02c6ff8-5f9f-4999-92a0-af16aed7690c'
        and tag in (...the five...);
     -- then restore the MC rows to Active/MP-batch if that is really wanted,
     -- and re-add the old key. It is recorded here for completeness; the state
     -- being reversed to is a fabricated one.
*/

do $$
declare
  k_as_of    constant date := date '2026-08-06';
  k_mc       constant text := 'MC281714';
  k_mp       constant text := 'MP281909';
  k_mc_batch constant uuid := '3692801b-6bb6-4861-aa85-4f89daf7d383';
  k_mp_batch constant uuid := 'c02c6ff8-5f9f-4999-92a0-af16aed7690c';
  k_tags     constant text[] := array[
    '1A40A030000E5B1000005907', '1A40A030000E5B1000005908',
    '1A40A030000E5B1000005909', '1A40A030000E5B1000005910',
    '1A40A030000E5B1000005911'];
  /* The two files agree on every field except Status Current. Both are stated
     here so neither side is reconstructed from the other. */
  k_rows constant jsonb := $j$[
    {"tag":"1A40A030000E5B1000005907","name":"M00004000825: Twisted Growers Glitter Bomb Flower 3.5g","strain":"TG Glitter Bomb"},
    {"tag":"1A40A030000E5B1000005908","name":"M00003389234: Twisted Growers Orange Cream Flower 3.5g","strain":"TG Orange Cream"},
    {"tag":"1A40A030000E5B1000005909","name":"M00003388911: Twisted Growers Gush Mintz Flower 3.5g","strain":"TG Gush Mintz"},
    {"tag":"1A40A030000E5B1000005910","name":"M00003632943: Twisted Growers Lemon Drop Flower 3.5g","strain":"TG Lemon Drop"},
    {"tag":"1A40A030000E5B1000005911","name":"M00003976015: Twisted Growers XJ-13 Flower 3.5g","strain":"TG XJ-13"}
  ]$j$::jsonb;
  v_dups   integer;
  v_nulls  integer;
  v_mc     integer;
  v_mp     integer;
  v_twice  integer;
  v_mixed  integer;
begin
  /* ── 1. The key can change ──────────────────────────────────────────── */
  select count(*) into v_dups from (
    select as_of_date, licence, tag from metrc_rpt_point_in_time
    group by 1, 2, 3 having count(*) > 1) x;
  if v_dups <> 0 then
    raise exception 'The new key would collide on % group(s). Rolling back.', v_dups;
  end if;

  select count(*) into v_nulls from metrc_rpt_point_in_time where licence is null;
  if v_nulls <> 0 then
    raise exception '% row(s) carry no licence and cannot enter a key that includes it. Rolling back.', v_nulls;
  end if;

  alter table public.metrc_rpt_point_in_time
    drop constraint metrc_rpt_point_in_time_pkey;
  alter table public.metrc_rpt_point_in_time
    add constraint metrc_rpt_point_in_time_pkey
    primary key (as_of_date, licence, tag);

  /* ── 2. Give the MC rows back what the MC file says ──────────────────
     They currently hold MP's status, MP's batch and MP's source_row under
     MC's licence. Restored from the MC export, not from the MP row beside
     them. */
  update metrc_rpt_point_in_time p
     set status_current = 'Transferred',
         import_id      = k_mc_batch,
         source_row     = jsonb_build_object(
           'Type', 'Package', 'Tag Number', r->>'tag', 'Name', r->>'name',
           'Category', 'Buds', 'Strain', r->>'strain',
           'Location', 'Finish Vault', 'Sublocation', '',
           'Expiration Date', '', 'Sell By Date', '', 'Use By Date', '',
           'Status Current', 'Transferred',
           'Plant Location On Date', '', 'Plant Current Location', '')
    from jsonb_array_elements(k_rows) as r
   where p.as_of_date = k_as_of and p.licence = k_mc and p.tag = r->>'tag';

  /* ── 3. Put MP's own rows back ───────────────────────────────────────── */
  insert into metrc_rpt_point_in_time (
    as_of_date, tag, record_type, name, category, strain, location, sublocation,
    status_current, expiration_date, sell_by_date, use_by_date, licence,
    source_row, import_id, imported_at)
  select
    k_as_of, r->>'tag', 'Package', r->>'name', 'Buds', r->>'strain',
    'Finish Vault', '', 'Active', null, null, null, k_mp,
    jsonb_build_object(
      'Type', 'Package', 'Tag Number', r->>'tag', 'Name', r->>'name',
      'Category', 'Buds', 'Strain', r->>'strain',
      'Location', 'Finish Vault', 'Sublocation', '',
      'Expiration Date', '', 'Sell By Date', '', 'Use By Date', '',
      'Status Current', 'Active',
      'Plant Location On Date', '', 'Plant Current Location', ''),
    k_mp_batch, now()
  from jsonb_array_elements(k_rows) as r;

  /* ── 4. Prove it, from the table ─────────────────────────────────────── */
  select count(*) into v_twice from (
    select tag from metrc_rpt_point_in_time
     where as_of_date = k_as_of and tag = any (k_tags)
     group by tag having count(*) = 2 and count(distinct licence) = 2) x;
  if v_twice <> 5 then
    raise exception 'Expected all five tags twice, once per licence; % qualified. Rolling back.', v_twice;
  end if;

  /* NO COLUMN MIX. Each row's licence, status, batch and stored source_row must
     tell one consistent story — which is exactly what the hybrid rows did not. */
  select count(*) into v_mixed from metrc_rpt_point_in_time
   where as_of_date = k_as_of and tag = any (k_tags)
     and not (
       (licence = k_mc and status_current = 'Transferred'
        and import_id = k_mc_batch and source_row->>'Status Current' = 'Transferred')
    or (licence = k_mp and status_current = 'Active'
        and import_id = k_mp_batch and source_row->>'Status Current' = 'Active'));
  if v_mixed <> 0 then
    raise exception '% row(s) still mix one licence''s columns with another''s. Rolling back.', v_mixed;
  end if;

  select count(*) into v_mc from metrc_rpt_point_in_time
   where as_of_date = k_as_of and licence = k_mc;
  select count(*) into v_mp from metrc_rpt_point_in_time
   where as_of_date = k_as_of and licence = k_mp;
  if v_mc <> 4520 or v_mp <> 648 then
    raise exception 'After the fix 2026-08-06 holds MC % and MP %, and the two files state 4,520 and 648. Rolling back.', v_mc, v_mp;
  end if;

  raise notice 'Key now (as_of_date, licence, tag). 2026-08-06: MC % rows, MP % rows. The five tags appear once under each licence.', v_mc, v_mp;
end $$;
