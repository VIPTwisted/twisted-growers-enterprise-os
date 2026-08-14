/* LOAD THE 1,151 MISSING PLANTS FROM METRC'S OWN REPORT, AND LABEL WHERE THEY CAME FROM.
 *
 * Owner, 14 Aug 2026: "use reports and assume role this is not complex."
 *
 * He is right, and I made it complex. The mirror is missing one contiguous block of
 * plant tags - 55107 to 56257 - which is the tail of Flower Room #1 and the whole of
 * Flower Room #2. The API has every tag below 55107 and every tag from 56258 up. Clean
 * edges both sides. That is not a room being invisible; it is one fetch that failed
 * while its siblings succeeded, got recorded as ok, and had the cursor advanced past
 * it. Exactly the defect fixed in v20 - this gap is its fingerprint, left behind.
 *
 * I spent a day on three wrong theories - page size, missing window, the inactive pass
 * overwriting flowering - all of them looking for something wrong with a ROOM. Nothing
 * was ever wrong with the room.
 *
 * WHY LOAD FROM THE REPORT RATHER THAN WAIT FOR THE API. metrc_rpt_point_in_time is
 * Metrc's own point-in-time export. Same legal record, different door. It already holds
 * every one of these plants with its tag, room, strain and phase. Refusing to use it
 * while the OS shows an empty room that is actually full is not caution, it is just a
 * worse answer - and it already sent the owner to walk a room that had 1,050 plants in
 * it.
 *
 * PROVENANCE IS KEPT, WHICH IS THE PART THAT MATTERS. metrc_plants gains a provenance
 * column defaulting to 'metrc api'. Rows loaded here say 'metrc report' and carry the
 * export date. Nothing is disguised as an API row. When the API finally returns these
 * tags the upsert on (license, tag) overwrites them and provenance flips back to
 * 'metrc api' on its own - so this heals rather than entrenches.
 *
 * WHAT IS NOT CLAIMED. The report is a dated export, not a live feed. These rows are
 * true as at its as_of date and are marked with it. planted_on is null because the
 * report does not carry it - null is honest, a guess would not be.
 */

alter table public.metrc_plants
  add column if not exists provenance text not null default 'metrc api';

comment on column public.metrc_plants.provenance is
  'Which door this row came through. "metrc api" is the live sync. "metrc report" means it was loaded from metrc_rpt_point_in_time, Metrc''s own export, because the API had never returned it - see report_as_of in raw for the date it was true. An API sync overwrites these on the same (license, tag) key, so the label heals itself.';

alter table public.metrc_plants
  add column if not exists report_as_of date;

comment on column public.metrc_plants.report_as_of is
  'Set only on rows loaded from a Metrc report export. The date that export was true. Null on API rows, which carry synced_at instead.';

insert into public.metrc_plants (license, tag, strain, phase, room, source_state, provenance, report_as_of, synced_at, raw)
select r.licence,
       r.tag,
       nullif(r.strain, ''),
       r.status_current,
       r.location,
       lower(r.status_current),
       'metrc report',
       r.as_of_date,
       now(),
       jsonb_build_object(
         'LocationName', r.location,
         'StrainName',   nullif(r.strain, ''),
         'GrowthPhase',  r.status_current,
         'Label',        r.tag,
         '_loaded_from', 'metrc_rpt_point_in_time',
         '_as_of',       r.as_of_date,
         '_why',         'The API has never returned this tag. It sits inside the contiguous gap 55107-56257 left by a sync that failed one fetch, reported ok, and advanced its cursor past it.'
       )
  from public.metrc_rpt_point_in_time r
 where r.as_of_date = (select max(as_of_date) from public.metrc_rpt_point_in_time)
   and r.record_type = 'Plant'
   and r.status_current in ('Flowering', 'Vegetative')
   and not exists (select 1 from public.metrc_plants p
                    where p.license = r.licence and p.tag = r.tag)
on conflict (license, tag) do nothing;;
