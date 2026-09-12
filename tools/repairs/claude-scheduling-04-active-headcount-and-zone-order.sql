-- Scheduling foundation, part 4 — what the first live draft taught (12 Sep 2026).
-- Applied as migration claude_scheduling_04_active_headcount_and_zone_order; f_draft_schedule was
-- re-created with the zone loop ordered by zones.sort_order (see part 3 for the full function).
--
--   1. Cultivation has 4 active primaries, not 5 (one is inactive) — the recommendation had counted
--      the inactive one. Flower 3 / Veg 1 / Dry & Cure 0: drying is intermittent and the flower team
--      covers it when a harvest hangs (a 'harvest'-driven requirement later; tracker sched.harvest_driven_requirements).
--   2. Cheap Pre-Rolls (3 people) had no zone of their own, so 3 of 5 pre-roll seats came back "short".
--      Economy Pre-Rolls is its own zone in the same room; Pre-Rolls keeps 2 for Flower/Infused.
--   3. The drafter fills zones in sort order (flower rooms first), not in uuid order.
--   Second live draft after this: 82 shifts placed, 0 open, 2 cells to review (weekend cover is
--   overtime for everyone at 40 h — flagged, the human decides). Both test drafts discarded; nothing posted.

update public.zone_staffing_requirements r set headcount_required = 0,
       note = note || ' Revised 12 Sep: dry/cure covered by the flower team; becomes harvest-driven.'
from public.zones z where z.id = r.zone_id and z.zone_key = 'dry_cure' and r.weekday between 1 and 5;

update public.zone_staffing_requirements r set headcount_required = 2,
       note = note || ' Revised 12 Sep: 2 = Flower/Infused Pre-Rolls primaries; Cheap Pre-Rolls has its own zone.'
from public.zones z where z.id = r.zone_id and z.zone_key = 'pre_rolls' and r.weekday between 1 and 5;

insert into public.zones (zone_key, name, department_id, description, rooms, what_happens_here, blueprint_group, sort_order, active, source)
select 'economy_pre_rolls', 'Economy Pre-Rolls', d.id, 'Cheap / economy raw pre-rolls, same room as Pre-Rolls.', array['office'],
       'Cheap / economy raw pre-rolls, same room as Pre-Rolls.', 'Packaging · Pre-rolls', 115, true,
       'Added 12 Sep 2026 after the first live draft: the Cheap Pre-Rolls department (3 people) needs a zone of its own to be drafted. HR to revise.'
from public.departments d where d.name = 'Cheap Pre-Rolls'
  and not exists (select 1 from public.zones where zone_key = 'economy_pre_rolls');

insert into public.zone_staffing_requirements (zone_id, department_id, weekday, shift, headcount_required, hours_per_head, driver, note, effective_from)
select z.id, z.department_id, wd, 'Day', 3, 8.0, 'manual',
       'Claude recommendation 12 Sep 2026: the 3 Cheap Pre-Rolls primaries. Revise in Settings › Staffing.', date '2026-09-14'
from public.zones z cross join generate_series(1, 5) wd
where z.zone_key = 'economy_pre_rolls'
  and not exists (select 1 from public.zone_staffing_requirements r where r.zone_id = z.id and r.weekday = wd);

-- In f_draft_schedule the requirement loop became:
--   select * from (select distinct on (z.id) ... z.sort_order ... order by z.id, (r.weekday is not null) desc, r.effective_from desc) q
--   order by q.sort_order, q.zone_name
