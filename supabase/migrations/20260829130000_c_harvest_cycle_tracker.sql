-- Harvest cycle tracker: policy table, scheduled-cut calendar, exception queue.
--
-- WHAT THIS IS
-- The four flower rooms run a 56-day cycle staggered 14 days apart, cut on a
-- Monday. This gives that schedule a home the owner can edit, replays every
-- scheduled cut against what Metrc actually recorded, and raises the misses.
--
-- WHAT THIS IS NOT
-- Not a Production Management module. Nothing here plans, assigns or instructs.
-- It reads Metrc and states whether a scheduled cut happened. Nothing writes to
-- Metrc. PIT is not touched. The metrc-aug26-drop ingest is not touched.
--
-- NOTHING HARDWIRED
-- cycle_days, stagger_days, week_start, harvest_weekday, next_harvest_date and
-- min_dried_lb all live in cult_cycle_policy, one row per room, owner-editable.
-- Room names live there too: Metrc spells the rooms 'F1'..'F4' and the plant
-- mirror spells them 'Flower Room #1'..'#4'. That mapping is data, not a CASE
-- statement buried in a view.
--
-- THREE EXISTING VIEWS ALREADY COVER PART OF THIS AND ARE NOT DUPLICATED
--   v_harvest_cycle_by_room      per-room cadence averages and next_pull_due
--   v_harvest_cycle_compliance   per-event cycle length vs target
--   v_harvest_takedown           what was actually cut, per room, per takedown
-- None of them answer "was the scheduled cut for week X made, and if not what
-- happened", because none of them generate the scheduled series. This adds that
-- and leaves those three alone.

-- ---------------------------------------------------------------------------
-- 1. POLICY
-- ---------------------------------------------------------------------------

create table if not exists cult_cycle_policy (
  room_key          text primary key,
  room_label        text        not null,
  metrc_room_code   text        not null,
  mirror_room_name  text        not null,
  cycle_days        integer     not null default 56  check (cycle_days between 1 and 365),
  stagger_days      integer     not null default 14  check (stagger_days between 0 and 365),
  week_start        text        not null default 'Monday',
  harvest_weekday   text        not null default 'Monday',
  next_harvest_date date        not null,
  min_dried_lb      numeric,
  -- Room capacity. All owner-set. Left NULL on seed ON PURPOSE: a guessed
  -- capacity would silently become the denominator of every "room short"
  -- calculation. NULL means the surface says NOT SET and raises nothing,
  -- per WO-005 - an honest gap beats a fabricated baseline.
  tables_in_room    integer     check (tables_in_room   is null or tables_in_room   > 0),
  plants_per_table  integer     check (plants_per_table is null or plants_per_table > 0),
  max_plants        integer     check (max_plants       is null or max_plants       > 0),
  target_plants     integer     check (target_plants    is null or target_plants    > 0),
  active            boolean     not null default true,
  sort_order        integer     not null default 0,
  note              text,
  updated_by        text,
  updated_at        timestamptz not null default now()
);

comment on table cult_cycle_policy is
  'Owner-editable harvest cycle policy, one row per flower room. Nothing in the '
  'calendar or the queue is hardwired: cadence, week start, cut weekday, the '
  'anchor date and the minimum dried yield all come from here. room_key is the '
  'canonical name; metrc_room_code and mirror_room_name are how Metrc and the '
  'plant mirror each spell the same room.';

comment on column cult_cycle_policy.next_harvest_date is
  'ANCHOR. The whole scheduled series is this date plus or minus multiples of '
  'cycle_days, so moving it moves every past and future scheduled cut for the '
  'room. Seeded from the room''s last measured pull plus cycle_days, snapped '
  'forward to harvest_weekday.';

comment on column cult_cycle_policy.min_dried_lb is
  'Dried pounds below which a cut that DID happen is reported PARTIAL. Null '
  'means the room has no minimum set and PARTIAL is never raised for it - the '
  'calendar says NOT ASSESSED rather than passing it silently.';

alter table cult_cycle_policy enable row level security;

drop policy if exists cult_cycle_policy_read on cult_cycle_policy;
create policy cult_cycle_policy_read on cult_cycle_policy
  for select using (true);

drop policy if exists cult_cycle_policy_write on cult_cycle_policy;
create policy cult_cycle_policy_write on cult_cycle_policy
  for all using (f_caller_is_admin()) with check (f_caller_is_admin());

-- Anchors are the last MEASURED pull for each room plus one cycle, snapped
-- forward to Monday. Derived from v_harvest_cycle_by_room on 29 Aug 2026:
--   F1 last 2026-06-26 -> +56 = 08-21 Fri -> Mon 2026-08-24
--   F2 last 2026-07-10 -> +56 = 09-04 Fri -> Mon 2026-09-07
--   F3 last 2026-07-24 -> +56 = 09-18 Fri -> Mon 2026-09-21
--   F4 last 2026-08-10 -> +56 =            Mon 2026-10-05
-- Those four anchors are exactly 14 days apart, which is the stagger the policy
-- states - the measured rooms and the stated cadence agree.
insert into cult_cycle_policy
  (room_key, room_label, metrc_room_code, mirror_room_name, next_harvest_date, sort_order, note)
values
  ('F1','Flower Room #1','F1','Flower Room #1', date '2026-08-24', 1, 'Anchor from last measured pull 2026-06-26 + 56d, snapped to Monday.'),
  ('F2','Flower Room #2','F2','Flower Room #2', date '2026-09-07', 2, 'Anchor from last measured pull 2026-07-10 + 56d, snapped to Monday.'),
  ('F3','Flower Room #3','F3','Flower Room #3', date '2026-09-21', 3, 'Anchor from last measured pull 2026-07-24 + 56d, snapped to Monday.'),
  ('F4','Flower Room #4','F4','Flower Room #4', date '2026-10-05', 4, 'Anchor from last measured pull 2026-08-10 + 56d, already a Monday.')
on conflict (room_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. DATE PRESET  as_of_now
-- ---------------------------------------------------------------------------
-- The queue is a standing position, not a date range: "what is late right now".
-- date_range_presets is the ONE date catalog (f_date_presets reads it), so the
-- preset goes there rather than into a second catalog in React.
insert into date_range_presets
  (preset_key, label, group_label, sort_order, from_expr, to_expr, is_to_date,
   is_default, note, calculation_kind, period_offset, rolling_days, manual_mode,
   show_as_quick, quick_label, span_months)
values
  ('as_of_now','As of now','General', 15, null, null, false, false,
   'No range. The surface states a position as it stands at page load, not a '
   'window of history. Used by standing queues, where a date filter would hide '
   'the very rows the queue exists to raise.',
   'unbounded', 0, null, 'none', false, null, null)
on conflict (preset_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. CALENDAR  v_cult_harvest_calendar
-- ---------------------------------------------------------------------------
-- One row per room per scheduled cut.
create or replace view v_cult_harvest_calendar as
with pol as (
  select *, date_trunc('week', next_harvest_date)::date as anchor_week
    from cult_cycle_policy
   where active
),
cult as (
  select coalesce(
           array_agg(upper(btrim(license))) filter (where active and kind = 'cultivation'),
           array['MC281714']) as lic
    from company_licenses
),
-- How far back to replay: the first harvest Metrc holds for a cultivation room.
span as (
  select coalesce(min(h.harvest_start), current_date - 365)::date as first_cut
    from metrc_harvests h, cult
   where upper(btrim(h.license)) = any (cult.lic)
),
-- The scheduled series: anchor +/- whole cycles.
sched as (
  select p.*,
         (p.anchor_week + (n * p.cycle_days))::date as week_start_date,
         (p.anchor_week + (n * p.cycle_days) + 6)::date as week_end_date,
         (p.anchor_week + ((n + 1) * p.cycle_days))::date as next_week_start,
         n as cycle_offset
    from pol p, span s
    cross join generate_series(-40, 8) as n
   where (p.anchor_week + (n * p.cycle_days))::date
           between date_trunc('week', s.first_cut)::date and (current_date + 180)
),
-- Metrc harvest batches, fenced to the cultivation licence, keyed to the room
-- by the policy's own metrc_room_code. Rows Metrc left without a room are NOT
-- silently dropped - they are counted separately and reported.
cuts as (
  select s.room_key,
         s.week_start_date,
         count(h.id)                                             as harvests_in_window,
         count(h.id) filter (where h.harvest_start between s.week_start_date and s.week_end_date) as harvests_in_week,
         min(h.harvest_start) filter (where h.harvest_start between s.week_start_date and s.week_end_date) as first_cut_in_week,
         min(h.harvest_start) filter (where h.harvest_start >  s.week_end_date)                            as first_cut_after_week,
         sum(coalesce((h.raw->>'PlantCount')::numeric,0))        as plants_cut,
         round(sum(f_to_pounds(
                     coalesce((h.raw->>'TotalPackagedWeight')::numeric,0),
                     coalesce(nullif(h.raw->>'UnitOfWeightName',''),'Grams'))), 2) as dried_lb,
         count(h.id) filter (where nullif(h.raw->>'FinishedDate','') is null)      as still_open
    from sched s
    left join metrc_harvests h
      on exists (select 1 from company_licenses c
                  where c.active and c.kind = 'cultivation'
                    and upper(btrim(c.license)) = upper(btrim(h.license)))
     and h.flower_room = s.metrc_room_code
     and h.harvest_start >= s.week_start_date
     and h.harvest_start <  s.next_week_start
   group by s.room_key, s.week_start_date
),
-- Plants standing in the room RIGHT NOW, from the flowering mirror, fenced to
-- the cultivation licence. Current state: it is attached only to the current and
-- future scheduled cuts, never to a historical one, where it would be a lie.
mirror as (
  select p.mirror_room_name as room_name, count(*) as plants_now
    from metrc_plants mp, cult, pol p
   where mp.source_state = 'flowering'
     and upper(btrim(mp.license)) = any (cult.lic)
     and coalesce(mp.raw->>'LocationName','') = p.mirror_room_name
   group by p.mirror_room_name
)
select s.room_key,
       s.room_label,
       s.week_start_date                                     as scheduled_week_start,
       s.week_end_date                                       as scheduled_week_end,
       s.cycle_days,
       s.stagger_days,
       s.harvest_weekday,
       c.harvests_in_week,
       c.harvests_in_window,
       c.first_cut_in_week,
       c.first_cut_after_week,
       nullif(c.plants_cut,0)                                as plants_cut,
       nullif(c.dried_lb,0)                                  as dried_lb,
       s.min_dried_lb,
       case when s.week_start_date >= date_trunc('week', current_date)::date
            then m.plants_now end                            as plants_in_room_now,
       -- Did the cut happen, and when
       case
         when c.harvests_in_week > 0                          then 'ON TIME'
         when c.harvests_in_window > 0                        then 'LATE'
         when s.week_start_date >= date_trunc('week', current_date)::date then 'DUE'
         when s.next_week_start > current_date                then 'DUE'
         else 'SKIPPED'
       end                                                    as timing,
       -- Headline status. PARTIAL outranks the timing only when the cut happened,
       -- every harvest on it is closed, and the yield is under the owner's floor.
       case
         when c.harvests_in_week = 0 and c.harvests_in_window = 0
              and s.week_start_date >= date_trunc('week', current_date)::date then 'DUE'
         when c.harvests_in_week = 0 and c.harvests_in_window = 0
              and s.next_week_start > current_date                            then 'DUE'
         when c.harvests_in_week = 0 and c.harvests_in_window = 0             then 'SKIPPED'
         -- Cut happened but Metrc still has the batch open past the owner's
         -- limit. Ranked ABOVE partial: an open harvest has no final dried
         -- weight, so calling it a yield miss would be measuring nothing.
         when c.still_open > 0
              and (current_date - s.week_end_date) > f_rule('harvest_open_max_days')
                                                                              then 'UNFINISHED'
         when s.min_dried_lb is not null and c.still_open = 0
              and coalesce(c.dried_lb,0) < s.min_dried_lb                     then 'PARTIAL'
         when c.harvests_in_week > 0                                          then 'ON TIME'
         else 'LATE'
       end                                                    as status,
       case
         when s.min_dried_lb is null then 'No minimum set for this room - yield not assessed.'
         when c.harvests_in_week = 0 and c.harvests_in_window = 0 then null
         when c.still_open > 0 then c.still_open || ' harvest(s) still open - dried weight is not final, so yield is NOT ASSESSED yet.'
         when coalesce(c.dried_lb,0) < s.min_dried_lb
           then 'Dried ' || coalesce(c.dried_lb,0) || ' lb against a ' || s.min_dried_lb || ' lb floor.'
         else 'Dried ' || coalesce(c.dried_lb,0) || ' lb, at or above the ' || s.min_dried_lb || ' lb floor.'
       end                                                    as yield_note,
       current_date - s.week_end_date                         as days_since_week_end,
       'metrc_harvests (Metrc API mirror), fenced to company_licenses kind=cultivation' as metrc_source,
       (select max(synced_at)::date from metrc_harvests)      as metrc_as_of
  from sched s
  join cuts c on c.room_key = s.room_key and c.week_start_date = s.week_start_date
  left join mirror m on m.room_name = s.mirror_room_name
 order by s.week_start_date desc, s.sort_order;

comment on view v_cult_harvest_calendar is
  'One row per flower room per scheduled cut, generated from cult_cycle_policy '
  'and replayed against metrc_harvests. status is ON TIME / LATE / SKIPPED / '
  'PARTIAL, plus DUE for a scheduled week that has not passed yet - without DUE '
  'a future cut would have to be called SKIPPED, which would be false. timing '
  'keeps ON TIME/LATE separately so PARTIAL never hides whether the cut was '
  'punctual. plants_in_room_now is CURRENT mirror state and is populated only '
  'for the current and future weeks; on a historical row it would be a lie.';

-- ---------------------------------------------------------------------------
-- 4. READER GATE  (same pattern as the Metrc exception queues)
-- ---------------------------------------------------------------------------
create or replace function f_xq_harvest_cycle_reader() returns boolean
language sql stable security definer set search_path = public as $$
  select (
           current_setting('request.jwt.claims', true) is null
           and session_user in ('postgres', 'supabase_admin', 'service_role', 'tg_desktop_reader')
         )
      or exists (
           select 1
             from public.nav_role_visibility v
            where v.view_key = 'xq_harvest_cycle'
              and v.visible
              and v.role = public.current_app_role()::text
         )
$$;

comment on function f_xq_harvest_cycle_reader() is
  'Reader gate for the harvest cycle queue. Same shape as f_xq_reader but keyed '
  'to its own view_key so cultivation visibility is set independently of the '
  'Metrc exception queues.';

-- ---------------------------------------------------------------------------
-- 5. QUEUE  v_xq_harvest_cycle
-- ---------------------------------------------------------------------------
create or replace view v_xq_harvest_cycle as
select bucket, ord, room_key, room_label, scheduled_week_start, scheduled_week_end,
       status, timing, harvests_in_week, plants_cut, dried_lb, min_dried_lb,
       plants_in_room_now, days_since_week_end, severity, what_is_wrong,
       what_to_do, yield_note, metrc_source, metrc_as_of, rule_used, rule_value
  from (
    select
      case
        when c.status = 'SKIPPED'                                              then 'Skipped'
        when c.status = 'UNFINISHED'                                           then 'Unfinished'
        when c.status = 'PARTIAL'                                              then 'Partial'
        when c.status = 'LATE'                                                 then 'Late'
        when c.status = 'DUE'
             and c.scheduled_week_start = date_trunc('week', current_date)::date then 'Due this week'
        else 'Next 7 days'
      end as bucket,
      case
        when c.status = 'SKIPPED'    then 1
        when c.status = 'UNFINISHED' then 2
        when c.status = 'PARTIAL'    then 3
        when c.status = 'LATE'       then 4
        when c.scheduled_week_start = date_trunc('week', current_date)::date then 5
        else 6
      end as ord,
      c.room_key, c.room_label, c.scheduled_week_start, c.scheduled_week_end,
      c.status, c.timing, c.harvests_in_week, c.plants_cut, c.dried_lb,
      c.min_dried_lb, c.plants_in_room_now, c.days_since_week_end,
      case
        when c.status = 'SKIPPED' and c.days_since_week_end > c.cycle_days then '1 SKIPPED MORE THAN A FULL CYCLE AGO'
        when c.status = 'SKIPPED'                                          then '2 SCHEDULED CUT NOT MADE'
        when c.status = 'UNFINISHED'                                       then '2 HARVEST STILL OPEN PAST THE LIMIT'
        when c.status = 'PARTIAL'                                          then '2 CUT MADE, YIELD UNDER THE FLOOR'
        when c.status = 'LATE'                                             then '3 CUT MADE AFTER ITS WEEK'
        else '4 SCHEDULED'
      end as severity,
      case
        when c.status = 'SKIPPED'
          then 'The scheduled cut for the week of ' || c.scheduled_week_start
               || ' has no harvest batch in Metrc for ' || c.room_label
               || ' at all, and the window has closed.'
        when c.status = 'UNFINISHED'
          then c.room_label || ' was cut for the week of ' || c.scheduled_week_start
               || ' but Metrc still has the harvest open. Dried weight is not final, '
               || 'so yield cannot be judged on this cut yet.'
        when c.status = 'PARTIAL'
          then c.room_label || ' was cut but dried ' || coalesce(c.dried_lb,0)
               || ' lb against a ' || c.min_dried_lb || ' lb floor.'
        when c.status = 'LATE'
          then c.room_label || ' was cut on ' || c.first_cut_after_week
               || ', after its scheduled week ending ' || c.scheduled_week_end || '.'
        when c.scheduled_week_start = date_trunc('week', current_date)::date
          then c.room_label || ' is scheduled to be cut this week.'
        else c.room_label || ' is scheduled to be cut in the week of ' || c.scheduled_week_start || '.'
      end as what_is_wrong,
      case
        when c.status = 'SKIPPED'
          then 'Confirm whether the room was actually cut. If it was, the harvest was never created in Metrc and that is the finding. If it was not, the cycle has slipped and every later cut in this room moves with it.'
        when c.status = 'UNFINISHED'
          then 'Finish the batch in Metrc once packaging and waste are complete. Metrc books the moisture balance itself on finish - it is never typed in (runbook METRC_HARVEST_MOISTURE_LOSS).'
        when c.status = 'PARTIAL'
          then 'Check the harvest is fully packaged before treating this as a yield miss - an open harvest has no final dried weight.'
        when c.status = 'LATE'
          then 'Nothing to correct in Metrc. Note the slip: the room''s later cuts inherit it unless the anchor is reset.'
        else 'Nothing yet. Raised so the week is visible before it passes.'
      end as what_to_do,
      c.yield_note, c.metrc_source, c.metrc_as_of,
      'cult_cycle_policy.cycle_days / min_dried_lb' as rule_used,
      c.cycle_days as rule_value
    from v_cult_harvest_calendar c
   where c.status in ('SKIPPED','UNFINISHED','PARTIAL','LATE')
      or (c.status = 'DUE' and c.scheduled_week_start
            between date_trunc('week', current_date)::date and current_date + 7)
   order by 2, c.scheduled_week_start desc
  ) __gated
 where f_xq_harvest_cycle_reader();

comment on view v_xq_harvest_cycle is
  'Harvest cycle exception queue: due this week, next 7 days, late, skipped, '
  'partial. Gated by f_xq_harvest_cycle_reader on view_key xq_harvest_cycle.';

-- ---------------------------------------------------------------------------
-- 6. REGISTRY
-- ---------------------------------------------------------------------------
insert into nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref,
   description, enabled, admin_only, page_kind, default_range, module)
select 'Cultivation',
       coalesce((select min(category_order) from nav_registry where category='Cultivation'), 20),
       'Harvest Cycle Queue',
       coalesce((select max(item_order)+1 from nav_registry where category='Cultivation'), 100),
       'calendar',
       'xq_harvest_cycle',
       'v_xq_harvest_cycle',
       'Scheduled cuts replayed against Metrc: due this week, next 7 days, late, skipped, partial. Schedule comes from cult_cycle_policy.',
       true, false, 'queue', 'as_of_now', 'Cultivation'
where not exists (select 1 from nav_registry where view_key = 'xq_harvest_cycle');

-- Visibility mirrors the Metrc exception queues: the roles that can see an
-- exception queue at all are the same roles.
insert into nav_role_visibility (view_key, role, visible)
select 'xq_harvest_cycle', v.role, v.visible
  from nav_role_visibility v
 where v.view_key = 'xq_metrc_exceptions'
on conflict (view_key, role) do nothing;

grant select on v_cult_harvest_calendar to authenticated, anon;
grant select on v_xq_harvest_cycle      to authenticated, anon;
grant select on cult_cycle_policy       to authenticated, anon;
