-- Grok lane 10 Sep 2026. Mirror completeness the map can actually show.
-- 1. Plant batches: live metrc_plant_batches by LocationName. Clone 50/4470 and
--    Veg 25/1430 already match the 9 Sep book; wire them so the book is not SoR.
-- 2. Harvest current room: raw DryingLocationName, not flower_room (origin).
--    21 open harvests sit in Dry Room #2 / Cure Vault / Fulfillment Vault.
-- 3. v_facility_s2s_rooms.harvest_wet_lb: THIS COLUMN ONLY. Posted 10 Sep as
--    unconverted sum(wet_weight). Metrc UnitOfWeightName is Grams. Convert with
--    f_to_pounds. Not a blanket grams→lb. Does not touch v_harvest_issues.wet_lb
--    or any inherited-lb column.
-- 4. Inactive plants: full sweep never reaches /plants/v2/inactive (veg+flower
--    consume the 110s budget). Last inactive write 3 Sep. Queue lastModified
--    windows from the last done plants backfill (14 Aug) to now. Not a Metrc POST.
-- No 3D/CSS change. No Claude objects.

create or replace view public.v_facility_s2s_rooms as
with plants as (
  select license,
         room,
         count(*) filter (where source_state = 'flowering')  as tagged_flowering,
         count(*) filter (where source_state = 'vegetative') as tagged_veg
    from metrc_plants
   where source_state in ('flowering','vegetative')
   group by 1,2
),
pkgs as (
  select p.license,
         p.location as room,
         count(*) as pkg_n,
         coalesce(sum(case when p.uom = 'g' then p.quantity else 0 end), 0) as pkg_qty_g,
         count(*) filter (
           where p.synced_at < (
             select max(s.started_at) from metrc_sync_runs s
              where s.endpoint like 'packages (full sweep)%'
                and s.status = 'ok'
                and s.finished_at is not null
                and s.license = p.license
           )
         ) as pkg_stale_n
    from metrc_packages p
   where p.source_state = 'active'
     and not coalesce(p.finished, false)
   group by 1,2
),
harv as (
  select license,
         nullif(btrim(raw->>'DryingLocationName'), '') as room,
         count(*) as harvests_open,
         coalesce(sum(public.f_to_pounds(
           wet_weight,
           coalesce(raw->>'UnitOfWeightName', raw->>'UnitOfWeightAbbreviation')
         )), 0) as harvest_wet_lb,
         coalesce(sum(coalesce((raw->>'PlantCount')::numeric, 0)), 0) as harvest_plants
    from metrc_harvests
   where source_state is distinct from 'inactive'
     and nullif(btrim(raw->>'DryingLocationName'), '') is not null
   group by 1,2
),
batches as (
  select b.license,
         nullif(btrim(b.raw->>'LocationName'), '') as room,
         count(*) as batch_n,
         coalesce(sum(b.count), 0) as batch_plants
    from metrc_plant_batches b
   where b.source_state = 'active'
     and nullif(btrim(b.raw->>'LocationName'), '') is not null
   group by 1,2
),
rooms as (
  select license, room from plants
  union
  select license, room from pkgs
  union
  select license, room from harv
  union
  select license, room from batches
)
select r.license as licence,
       r.room,
       coalesce(pl.tagged_flowering, 0)::int as tagged_flowering,
       coalesce(pl.tagged_veg, 0)::int as tagged_veg,
       coalesce(pk.pkg_n, 0)::int as pkg_n,
       coalesce(pk.pkg_qty_g, 0)::numeric as pkg_qty_g,
       coalesce(pk.pkg_stale_n, 0)::int as pkg_stale_n,
       coalesce(h.harvests_open, 0)::int as harvests_open,
       round(coalesce(h.harvest_wet_lb, 0), 1) as harvest_wet_lb,
       (select max(synced_at) from metrc_packages p2 where p2.license = r.license) as packages_as_of,
       (select max(synced_at) from metrc_plants t2
         where t2.license = r.license
           and t2.source_state in ('flowering','vegetative')) as plants_as_of,
       case
         when coalesce(pl.tagged_flowering,0)+coalesce(pl.tagged_veg,0)
            + coalesce(pk.pkg_n,0)+coalesce(h.harvests_open,0)+coalesce(b.batch_n,0) = 0
           then 'EMPTY'
         when coalesce(pk.pkg_stale_n,0) > 0 then 'ISSUE'
         when coalesce(pl.tagged_flowering,0)+coalesce(pl.tagged_veg,0)
            + coalesce(b.batch_plants,0)+coalesce(h.harvests_open,0) > 0 then 'CERTIFIED'
         else 'PARTIAL'
       end as status,
       coalesce(b.batch_n, 0)::int as batch_n,
       coalesce(b.batch_plants, 0)::int as batch_plants,
       coalesce(h.harvest_plants, 0)::int as harvest_plants,
       (select max(synced_at) from metrc_plant_batches bb where bb.license = r.license) as batches_as_of,
       (select max(synced_at) from metrc_harvests hh where hh.license = r.license) as harvests_as_of
  from rooms r
  left join plants pl on pl.license = r.license and pl.room = r.room
  left join pkgs pk on pk.license = r.license and pk.room = r.room
  left join harv h on h.license = r.license and h.room = r.room
  left join batches b on b.license = r.license and b.room = r.room;

comment on view public.v_facility_s2s_rooms is
  'Live Metrc occupancy for the facility map. Tagged plants, active unfinished packages, untagged plant batches by LocationName, open harvests by DryingLocationName (current room, not flower_room origin). harvest_wet_lb is f_to_pounds(wet_weight, UnitOfWeightName) — the one column posted 10 Sep as raw grams aliased lb. Not a blanket convert. Fail closed: map keeps the 9 Sep book if this view does not answer.';

grant select on public.v_facility_s2s_rooms to authenticated, tg_desktop_reader;
revoke all on public.v_facility_s2s_rooms from anon, public;

notify pgrst, 'reload schema';

insert into public.metrc_backfill_window
  (endpoint, licence, win_start, win_end, status, attempts, note)
values
  ('plants','MC281714','2026-08-14 00:00:00+00','2026-08-21 00:00:00+00','pending',0,
   'Inactive plants last written 3 Sep. Last done plants window ended 14 Aug. Not a Metrc POST.'),
  ('plants','MC281714','2026-08-21 00:00:00+00','2026-08-28 00:00:00+00','pending',0,
   'Inactive plants gap. Windowed lastModified. Not a Metrc POST.'),
  ('plants','MC281714','2026-08-28 00:00:00+00','2026-09-04 00:00:00+00','pending',0,
   'Inactive plants gap. Windowed lastModified. Not a Metrc POST.'),
  ('plants','MC281714','2026-09-04 00:00:00+00','2026-09-11 00:00:00+00','pending',0,
   'Inactive plants gap. Windowed lastModified. Not a Metrc POST.')
on conflict (endpoint, licence, win_start, win_end) do nothing;

insert into public.deployment_check
  (check_key, section, title, why, kind, severity, expected, status, active, sort_order)
values
  ('plants.inactive_fresh','4 Data grain',
   'Inactive plants pulled recently',
   'plants full sweep stops at veg+flower (4410) inside the 110s budget, so /plants/v2/inactive is never reached. Harvested plants land there. Stale inactive is a mirror hole, not a Metrc POST.',
   'auto','NO-GO','<= 36 hours','PENDING',true,22),
  ('plants.batches_live','4 Data grain',
   'Clone/Veg untagged batches match live Metrc',
   'Map clone/veg occupancy is metrc_plant_batches UntrackedCount by LocationName. The 9 Sep book is the fail-closed fallback, not SoR.',
   'auto','WATCH','Clone + Veg match live','PENDING',true,23),
  ('harvests.current_room','4 Data grain',
   'Open harvests sit on DryingLocationName',
   'flower_room is origin (parsed from the harvest name). Current room is raw DryingLocationName. Map occupancy uses current, never origin.',
   'auto','WATCH','all 21 placed','PENDING',true,24)
on conflict (check_key) do nothing;

create or replace function public.f_deployment_checks_s2s()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  n int; m int; t timestamptz; s text; d text;
begin
  select max(synced_at) into t from metrc_plants where source_state = 'inactive';
  n := round(extract(epoch from (now() - t)) / 3600.0);
  s := case when t is null then 'FAIL' when n <= 36 then 'PASS' when n <= 168 then 'WARN' else 'FAIL' end;
  perform f_deployment_check_record('plants.inactive_fresh', s,
    coalesce(n::text, 'never') || ' h ago',
    'metrc_plants inactive last written ' || coalesce(t::timestamp(0)::text, 'never')
    || '. Full sweep never reaches this sub-state. Completeness is windowed lastModified backfill, not a 54k page-1 re-walk.');

  select coalesce(sum(batch_plants),0)::int into n
    from v_facility_s2s_rooms
   where licence = 'MC281714' and room in ('Clone Room','Vegetation Room');
  select coalesce(sum(b.count),0)::int into m
    from metrc_plant_batches b
   where b.license = 'MC281714' and b.source_state = 'active';
  s := case when n = m and m > 0 then 'PASS' when n = m then 'WARN' else 'FAIL' end;
  perform f_deployment_check_record('plants.batches_live', s,
    'view ' || n || ' / table ' || m,
    'Untagged live plants on the map must equal sum(count) of active metrc_plant_batches. LocationName is Clone Room and Vegetation Room.');

  select count(*) into n from metrc_harvests
   where source_state is distinct from 'inactive'
     and nullif(btrim(raw->>'DryingLocationName'), '') is null;
  select coalesce(sum(harvests_open),0) into m from v_facility_s2s_rooms
   where licence = 'MC281714' and harvests_open > 0;
  s := case when n = 0 and m > 0 then 'PASS' when n = 0 then 'WARN' else 'FAIL' end;
  select string_agg(room || '=' || harvests_open || '/' || harvest_plants || ' @ ' || harvest_wet_lb::text || ' lb', ' · ' order by room)
    into d
    from v_facility_s2s_rooms
   where harvests_open > 0;
  perform f_deployment_check_record('harvests.current_room', s,
    m || ' open on map / ' || n || ' missing DryingLocationName',
    coalesce(d, 'none')
    || '. flower_room is origin. DryingLocationName is current. harvest_wet_lb is f_to_pounds of Metrc Grams.');
end
$fn$;

comment on function public.f_deployment_checks_s2s() is
  'Grok-lane map/mirror checks: inactive plant freshness, live plant batches, harvest current room. Called from f_deployment_checks_run.';

revoke all on function public.f_deployment_checks_s2s() from public, anon, authenticated;
grant execute on function public.f_deployment_checks_s2s() to postgres, service_role;
