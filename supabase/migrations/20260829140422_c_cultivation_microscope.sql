-- Cultivation microscope: daily plant balance, hidden-destroy detection,
-- schedule tamper, notification rules, and the Cultivation dashboard home.
--
-- Builds on 20260829130000 (cult_cycle_policy + v_cult_harvest_calendar +
-- v_xq_harvest_cycle). Nothing there is replaced.
--
-- ===========================================================================
-- THREE MEASURED FACTS THAT SHAPE EVERY OBJECT BELOW
-- ===========================================================================
-- Measured on prod, 29 Aug 2026, before writing a line of this:
--
-- 1. THE PLANT MIRROR HAS NO YESTERDAY.
--    metrc_plants holds CURRENT state only. Every flowering and vegetative row
--    carries synced_at = today; there is no per-day history anywhere in the
--    schema. "Yesterday vs today" is therefore not derivable from what exists.
--    A residual computed against a missing yesterday would come out as zero and
--    read as "no hidden destroys" - the most dangerous possible false negative
--    on a diversion-class control. So this migration CREATES the daily snapshot
--    that makes the balance possible, and the balance view refuses rather than
--    zeroes until two consecutive days exist.
--
-- 2. THE DESTROY FEED IS UNDATED AND STALE.
--    metrc_rpt_plants_destroyed: 3,773 rows, and destroyed_on, destroyed_by and
--    destroyed_note are ALL 100% NULL. The only usable date is phase_date, whose
--    latest value anywhere is 2026-05-18 - over three months ago. The single
--    export is as_of 2026-08-06. A destroy cannot currently be attributed to a
--    day, so the balance cannot subtract it honestly.
--    Per WO-005 the surface renders an honest gap card naming what is missing
--    and what would fill it. It never books an undated destroy as zero.
--
-- 3. ROOM CAPACITY IS NOT RECORDED.
--    tables_in_room / plants_per_table / max_plants / target_plants seed NULL in
--    cult_cycle_policy on purpose. A guessed capacity becomes the denominator of
--    every room-short calculation. NOT SET raises nothing and says so.
--
-- Nothing here writes to Metrc. PIT is not read. The metrc-aug26-drop ingest is
-- not touched.

-- ===========================================================================
-- 1. DAILY PLANT SNAPSHOT  (the missing yesterday)
-- ===========================================================================

create table if not exists cult_room_plant_snapshot (
  taken_on   date    not null,
  room_key   text    not null,
  phase      text    not null,
  plants     integer not null check (plants >= 0),
  licence    text    not null,
  taken_by   text    not null default 'cron',
  created_at timestamptz not null default now(),
  primary key (taken_on, room_key, phase)
);

comment on table cult_room_plant_snapshot is
  'One row per room per phase per day: how many plants the flowering/vegetative '
  'mirror held. Exists because metrc_plants carries current state only - without '
  'this table there is no yesterday, and no plant balance can be computed at all.';

alter table cult_room_plant_snapshot enable row level security;
drop policy if exists cult_room_plant_snapshot_read on cult_room_plant_snapshot;
create policy cult_room_plant_snapshot_read on cult_room_plant_snapshot for select using (true);
drop policy if exists cult_room_plant_snapshot_write on cult_room_plant_snapshot;
create policy cult_room_plant_snapshot_write on cult_room_plant_snapshot
  for all using (f_caller_is_admin()) with check (f_caller_is_admin());

create or replace function tg_snapshot_room_plants() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into cult_room_plant_snapshot (taken_on, room_key, phase, plants, licence)
  select current_date,
         p.room_key,
         initcap(mp.source_state),
         count(*),
         upper(btrim(mp.license))
    from metrc_plants mp
    join cult_cycle_policy p
      on coalesce(mp.raw->>'LocationName','') = p.mirror_room_name
   where p.active
     and mp.source_state in ('flowering','vegetative')
     and exists (select 1 from company_licenses c
                  where c.active and c.kind = 'cultivation'
                    and upper(btrim(c.license)) = upper(btrim(mp.license)))
   group by p.room_key, initcap(mp.source_state), upper(btrim(mp.license))
  on conflict (taken_on, room_key, phase)
    do update set plants = excluded.plants, created_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

comment on function tg_snapshot_room_plants() is
  'Nightly. Writes today''s per-room, per-phase flowering/vegetative plant count '
  'from the mirror, fenced to the cultivation licence. Idempotent within a day.';

-- ===========================================================================
-- 2. PLANT BALANCE  v_cult_plant_balance_daily
-- ===========================================================================
-- yesterday - harvested - destroyed = today.  Anything left over is a plant
-- that left the room with no recorded reason: HIDDEN DESTROY.
create or replace view v_cult_plant_balance_daily as
with cult as (
  select coalesce(array_agg(upper(btrim(license))) filter (where active and kind='cultivation'),
                  array['MC281714']) as lic
    from company_licenses
),
-- Is the destroy feed usable as a dated series at all? Measured, not assumed.
destroy_feed as (
  select count(*)                                as rows_held,
         count(destroyed_on)                     as dated_rows,
         max(phase_date)                         as latest_phase_date,
         max(as_of_date)                         as export_as_of
    from metrc_rpt_plants_destroyed
),
today_snap as (
  select room_key, sum(plants) as plants
    from cult_room_plant_snapshot
   where taken_on = (select max(taken_on) from cult_room_plant_snapshot)
     and phase = 'Flowering'
   group by room_key
),
prev_snap as (
  select room_key, sum(plants) as plants
    from cult_room_plant_snapshot
   where taken_on = (select max(taken_on) from cult_room_plant_snapshot
                      where taken_on < (select max(taken_on) from cult_room_plant_snapshot))
     and phase = 'Flowering'
   group by room_key
),
bounds as (
  select (select max(taken_on) from cult_room_plant_snapshot) as today_on,
         (select max(taken_on) from cult_room_plant_snapshot
           where taken_on < (select max(taken_on) from cult_room_plant_snapshot)) as prev_on
),
harvested as (
  select p.room_key,
         sum(coalesce((h.raw->>'PlantCount')::numeric,0)) as plants_harvested
    from metrc_harvests h
    join cult_cycle_policy p on p.metrc_room_code = h.flower_room
    cross join bounds b, cult
   where upper(btrim(h.license)) = any (cult.lic)
     and b.prev_on is not null
     and h.harvest_start > b.prev_on and h.harvest_start <= b.today_on
   group by p.room_key
),
destroyed as (
  select p.room_key, count(*) as plants_destroyed
    from metrc_rpt_plants_destroyed d
    join cult_cycle_policy p on p.mirror_room_name = d.location
    cross join bounds b
   where d.destroyed_on is not null
     and b.prev_on is not null
     and d.destroyed_on > b.prev_on and d.destroyed_on <= b.today_on
   group by p.room_key
)
select p.room_key,
       p.room_label,
       b.prev_on                                        as measured_from,
       b.today_on                                       as measured_to,
       pv.plants                                        as plants_yesterday,
       td.plants                                        as plants_today,
       coalesce(h.plants_harvested,0)::integer          as plants_harvested,
       coalesce(d.plants_destroyed,0)::integer          as plants_destroyed,
       case when pv.plants is null or td.plants is null then null
            else pv.plants - coalesce(h.plants_harvested,0)::integer
                            - coalesce(d.plants_destroyed,0)::integer - td.plants
       end                                              as residual,
       -- The verdict never guesses. Three explicit states before any finding.
       case
         when b.prev_on is null
           then 'NOT MEASURABLE - NO PRIOR DAY'
         when pv.plants is null or td.plants is null
           then 'NOT MEASURABLE - ROOM MISSING FROM ONE OF THE TWO SNAPSHOTS'
         when df.dated_rows = 0
           then 'NOT MEASURABLE - DESTROY FEED CARRIES NO DATE'
         when pv.plants - coalesce(h.plants_harvested,0)::integer
                        - coalesce(d.plants_destroyed,0)::integer - td.plants = 0
           then 'BALANCED'
         when pv.plants - coalesce(h.plants_harvested,0)::integer
                        - coalesce(d.plants_destroyed,0)::integer - td.plants > 0
           then 'HIDDEN DESTROY'
         else 'MORE PLANTS THAN YESTERDAY - REPLANT OR MISCOUNT'
       end                                              as verdict,
       -- WO-005 gap card: name what is missing and what would fill it.
       case
         when b.prev_on is null
           then 'Only one day of plant snapshots exists. The balance needs two. '
                || 'tg_snapshot_room_plants() must run once more, on a later day, '
                || 'before any residual can be stated. This is not a zero residual.'
         when df.dated_rows = 0
           then 'The destroy feed holds ' || df.rows_held || ' rows and NONE of them '
                || 'carry destroyed_on - it is 100% null. Its newest phase_date is '
                || coalesce(df.latest_phase_date::text,'unknown') || ' and the only export is as of '
                || coalesce(df.export_as_of::text,'unknown') || '. Destroys cannot be attributed '
                || 'to a day, so a residual here cannot be separated into destroyed '
                || 'versus hidden. WHAT WOULD FILL IT: a Metrc Plants Destroyed export '
                || 'carrying the destroy date, loaded by the ingest lane.'
         else null
       end                                              as gap_card,
       df.rows_held                                     as destroy_rows_held,
       df.dated_rows                                    as destroy_rows_dated,
       df.latest_phase_date                             as destroy_feed_newest,
       'metrc_plants mirror via cult_room_plant_snapshot; metrc_harvests; metrc_rpt_plants_destroyed'
                                                        as sources
  from cult_cycle_policy p
  cross join bounds b
  cross join destroy_feed df
  left join today_snap td on td.room_key = p.room_key
  left join prev_snap  pv on pv.room_key = p.room_key
  left join harvested  h  on h.room_key  = p.room_key
  left join destroyed  d  on d.room_key  = p.room_key
 where p.active
 order by p.sort_order;

comment on view v_cult_plant_balance_daily is
  'yesterday - harvested - destroyed = today, per flower room. A positive '
  'residual is HIDDEN DESTROY: plants left the room with no harvest and no '
  'destroy record. Returns NOT MEASURABLE with a gap card rather than a zero '
  'whenever the prior snapshot or the destroy date is absent (WO-005).';

-- ===========================================================================
-- 3. SCHEDULE SNAPSHOT + TAMPER
-- ===========================================================================
create table if not exists cult_schedule_snapshot (
  taken_on          date not null,
  room_key          text not null,
  next_harvest_date date,
  min_dried_lb      numeric,
  cycle_days        integer,
  target_plants     integer,
  created_at        timestamptz not null default now(),
  primary key (taken_on, room_key)
);

comment on table cult_schedule_snapshot is
  'Nightly copy of the owner-editable parts of cult_cycle_policy. An edit to '
  'next_harvest_date or min_dried_lb AFTER a scheduled week has already started '
  'is SCHEDULE TAMPER - the target moved after the result was known.';

alter table cult_schedule_snapshot enable row level security;
drop policy if exists cult_schedule_snapshot_read on cult_schedule_snapshot;
create policy cult_schedule_snapshot_read on cult_schedule_snapshot for select using (true);
drop policy if exists cult_schedule_snapshot_write on cult_schedule_snapshot;
create policy cult_schedule_snapshot_write on cult_schedule_snapshot
  for all using (f_caller_is_admin()) with check (f_caller_is_admin());

create or replace function tg_snapshot_cult_schedule() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into cult_schedule_snapshot
    (taken_on, room_key, next_harvest_date, min_dried_lb, cycle_days, target_plants)
  select current_date, room_key, next_harvest_date, min_dried_lb, cycle_days, target_plants
    from cult_cycle_policy where active
  on conflict (taken_on, room_key) do update
    set next_harvest_date = excluded.next_harvest_date,
        min_dried_lb      = excluded.min_dried_lb,
        cycle_days        = excluded.cycle_days,
        target_plants     = excluded.target_plants;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace view v_cult_schedule_tamper as
with latest as (
  select distinct on (room_key) room_key, taken_on, next_harvest_date, min_dried_lb, cycle_days
    from cult_schedule_snapshot order by room_key, taken_on desc
),
prior as (
  select distinct on (s.room_key) s.room_key, s.taken_on, s.next_harvest_date, s.min_dried_lb, s.cycle_days
    from cult_schedule_snapshot s
    join latest l on l.room_key = s.room_key and s.taken_on < l.taken_on
   order by s.room_key, s.taken_on desc
)
select p.room_key, p.room_label,
       pr.taken_on            as was_on,
       la.taken_on            as changed_by,
       pr.next_harvest_date   as next_harvest_was,
       la.next_harvest_date   as next_harvest_now,
       pr.min_dried_lb        as min_dried_was,
       la.min_dried_lb        as min_dried_now,
       pr.cycle_days          as cycle_days_was,
       la.cycle_days          as cycle_days_now,
       date_trunc('week', pr.next_harvest_date)::date as affected_week_start,
       (la.next_harvest_date  is distinct from pr.next_harvest_date) as next_harvest_moved,
       (la.min_dried_lb       is distinct from pr.min_dried_lb)      as floor_moved,
       (la.cycle_days         is distinct from pr.cycle_days)        as cycle_moved,
       -- Tamper only if the edit landed after the affected week had begun.
       (la.taken_on >= date_trunc('week', pr.next_harvest_date)::date) as after_week_start
  from cult_cycle_policy p
  join latest la on la.room_key = p.room_key
  join prior  pr on pr.room_key = p.room_key
 where p.active
   and ( la.next_harvest_date is distinct from pr.next_harvest_date
      or la.min_dried_lb      is distinct from pr.min_dried_lb
      or la.cycle_days        is distinct from pr.cycle_days );

-- ===========================================================================
-- 4. QUEUES
-- ===========================================================================

create or replace view v_xq_hidden_destroy as
select * from (
  select 'Hidden destroy'::text as queue,
         b.room_key, b.room_label, b.measured_from, b.measured_to,
         b.plants_yesterday, b.plants_today, b.plants_harvested, b.plants_destroyed,
         b.residual, b.verdict,
         case when b.verdict = 'HIDDEN DESTROY' then '1 PLANTS GONE WITH NO RECORD'
              when b.verdict like 'NOT MEASURABLE%' then '2 CANNOT BE MEASURED'
              else '4 BALANCED' end as severity,
         case when b.verdict = 'HIDDEN DESTROY'
                then b.residual || ' plants left ' || b.room_label
                     || ' with no harvest and no destroy record between '
                     || b.measured_from || ' and ' || b.measured_to || '.'
              else coalesce(b.gap_card, b.room_label || ' balances.') end as what_is_wrong,
         case when b.verdict = 'HIDDEN DESTROY'
                then 'Diversion-class. No materiality floor applies. Find the plants or find the record; if they were destroyed, Metrc was never told.'
              else 'Load the missing feed before reading anything into this row.' end as what_to_do,
         b.gap_card, b.sources as metrc_source,
         (select max(taken_on) from cult_room_plant_snapshot) as metrc_as_of
    from v_cult_plant_balance_daily b
   where b.verdict = 'HIDDEN DESTROY' or b.verdict like 'NOT MEASURABLE%'
) __gated where f_xq_harvest_cycle_reader();

create or replace view v_xq_room_short as
select * from (
  select 'Room short'::text as queue,
         p.room_key, p.room_label, p.target_plants, p.max_plants,
         s.plants as plants_now,
         case when p.target_plants is null then null else p.target_plants - s.plants end as short_by,
         case when p.target_plants is null then '3 NO TARGET SET'
              when s.plants is null        then '2 ROOM NOT IN THE MIRROR'
              when s.plants < p.target_plants * 0.9 then '1 MORE THAN 10% UNDER TARGET'
              when s.plants < p.target_plants       then '2 UNDER TARGET'
              else '4 AT OR ABOVE TARGET' end as severity,
         case when p.target_plants is null
                then p.room_label || ' has no target_plants set in cult_cycle_policy, so '
                     || 'short cannot be measured. NOT a zero shortfall. Set the target to enable this check.'
              when s.plants is null
                then p.room_label || ' returned no flowering plants from the mirror at all. '
                     || 'Read this as unsynced, not as empty, until the mirror is confirmed.'
              else p.room_label || ' holds ' || s.plants || ' flowering plants against a target of '
                   || p.target_plants || '.' end as what_is_wrong,
         'Confirm the room against Metrc before acting. A short room is either a real planting gap or a sync gap, and the two look identical from here.'::text as what_to_do,
         'metrc_plants mirror via cult_room_plant_snapshot, fenced to cultivation licence'::text as metrc_source,
         (select max(taken_on) from cult_room_plant_snapshot) as metrc_as_of
    from cult_cycle_policy p
    left join (select room_key, sum(plants) plants
                 from cult_room_plant_snapshot
                where taken_on = (select max(taken_on) from cult_room_plant_snapshot)
                  and phase='Flowering' group by room_key) s on s.room_key = p.room_key
   where p.active
     and (p.target_plants is null or s.plants is null or s.plants < p.target_plants)
) __gated where f_xq_harvest_cycle_reader();

create or replace view v_xq_yield_miss as
select * from (
  select 'Yield miss'::text as queue,
         c.room_key, c.room_label, c.scheduled_week_start, c.status,
         c.dried_lb, c.min_dried_lb, c.plants_cut,
         m.moisture_pct, f_rule('expected_moisture_pct_min') as band_min,
         f_rule('expected_moisture_pct_max') as band_max,
         f_rule('moisture_loss_goal_pct')    as goal_pct,
         case when c.status = 'PARTIAL' then '2 DRIED UNDER THE FLOOR'
              when m.moisture_pct is not null
               and (m.moisture_pct < f_rule('expected_moisture_pct_min')
                 or m.moisture_pct > f_rule('expected_moisture_pct_max'))
                                             then '2 MOISTURE OUTSIDE THE BAND'
              else '3 REVIEW' end as severity,
         case when c.status = 'PARTIAL'
                then c.room_label || ' dried ' || coalesce(c.dried_lb,0) || ' lb against a '
                     || c.min_dried_lb || ' lb floor for the week of ' || c.scheduled_week_start || '.'
              else c.room_label || ' moisture ' || m.moisture_pct || '% is outside the '
                   || f_rule('expected_moisture_pct_min') || '-' || f_rule('expected_moisture_pct_max')
                   || '% band (goal ' || f_rule('moisture_loss_goal_pct') || '%).' end as what_is_wrong,
         'Moisture loss is never typed into Metrc - it is what finishing the batch produces. Far below band usually means water was packaged or wasted as product (runbook METRC_HARVEST_MOISTURE_LOSS, rule D2: raise it, never correct it quietly).'::text as what_to_do,
         'metrc_harvests, corroborated against metrc_rpt_harvest_moisture'::text as metrc_source,
         c.metrc_as_of,
         'expected_moisture_pct_min/max, moisture_loss_goal_pct, cult_cycle_policy.min_dried_lb'::text as rule_used
    from v_cult_harvest_calendar c
    left join lateral (
      select avg(hm.moisture_pct) as moisture_pct
        from metrc_rpt_harvest_moisture hm
        join cult_cycle_policy p2 on p2.mirror_room_name = hm.room
       where p2.room_key = c.room_key
         and hm.finished_on between c.scheduled_week_start and c.scheduled_week_end
    ) m on true
   where c.status = 'PARTIAL'
      or (m.moisture_pct is not null
          and (m.moisture_pct < f_rule('expected_moisture_pct_min')
            or m.moisture_pct > f_rule('expected_moisture_pct_max')))
) __gated where f_xq_harvest_cycle_reader();

create or replace view v_xq_schedule_tamper as
select * from (
  select 'Schedule tamper'::text as queue,
         t.room_key, t.room_label, t.was_on, t.changed_by,
         t.next_harvest_was, t.next_harvest_now, t.min_dried_was, t.min_dried_now,
         t.cycle_days_was, t.cycle_days_now, t.affected_week_start,
         case when t.after_week_start then '1 SCHEDULE EDITED AFTER THE WEEK STARTED'
              else '3 SCHEDULE EDITED' end as severity,
         case when t.after_week_start
                then 'The schedule for ' || t.room_label || ' was edited on ' || t.changed_by
                     || ', after the affected week beginning ' || t.affected_week_start
                     || ' had already started. The target moved once the result was known.'
              else 'The schedule for ' || t.room_label || ' changed on ' || t.changed_by || '.' end as what_is_wrong,
         'Confirm who changed it and why. A cut is judged against the schedule as it stood at the start of its week, not as it stands now.'::text as what_to_do,
         'cult_schedule_snapshot (nightly copy of cult_cycle_policy)'::text as metrc_source,
         t.changed_by as metrc_as_of
    from v_cult_schedule_tamper t
) __gated where f_xq_harvest_cycle_reader();

-- ===========================================================================
-- 5. NOTIFY RULES
-- ===========================================================================
create table if not exists notify_rules (
  rule_key            text primary key,
  label               text    not null,
  event_source        text    not null,
  severity            text    not null,
  role                text    not null default 'owner',
  notify_in_app       boolean not null default true,
  notify_email        boolean not null default false,
  quiet_hours_start   time,
  quiet_hours_end     time,
  ignores_quiet_hours boolean not null default false,
  remind_every_days   integer,
  escalate_after_days integer,
  escalate_to         text,
  active              boolean not null default true,
  note                text,
  updated_by          text,
  updated_at          timestamptz not null default now()
);

comment on table notify_rules is
  'One row per notifiable cultivation event. Owner-editable. ignores_quiet_hours '
  'is reserved for diversion-class events that must wake somebody: a hidden '
  'destroy is plants gone with no record and does not wait until morning.';

alter table notify_rules enable row level security;
drop policy if exists notify_rules_read on notify_rules;
create policy notify_rules_read on notify_rules for select using (true);
drop policy if exists notify_rules_write on notify_rules;
create policy notify_rules_write on notify_rules
  for all using (f_caller_is_admin()) with check (f_caller_is_admin());

insert into notify_rules
  (rule_key, label, event_source, severity, notify_email, quiet_hours_start,
   quiet_hours_end, ignores_quiet_hours, remind_every_days, escalate_after_days, note)
values
  ('hidden_destroy','Hidden destroy - plants gone with no record','v_xq_hidden_destroy','critical',
   true, null, null, true, 1, 1,
   'Diversion class. IGNORES QUIET HOURS by design: plants left a room with no harvest and no destroy record.'),
  ('destroy_posted','Destroy posted','metrc_rpt_plants_destroyed','info',
   false, time '21:00', time '07:00', false, null, null,
   'Informational. Currently NOT FIRING: the destroy feed carries no destroyed_on date at all.'),
  ('room_short','Room short of target','v_xq_room_short','high',
   true, time '21:00', time '07:00', false, 2, 5, null),
  ('cut_miss_mon_wed','Scheduled Mon/Wed cut not recorded','v_xq_harvest_cycle','high',
   true, time '21:00', time '07:00', false, 1, 2,
   'Fires on the cut weekday set in cult_cycle_policy.harvest_weekday.'),
  ('skipped_week','Scheduled week skipped entirely','v_xq_harvest_cycle','high',
   true, time '21:00', time '07:00', false, 3, 7, null),
  ('yield_miss','Dried yield under the floor','v_xq_yield_miss','high',
   true, time '21:00', time '07:00', false, 3, 7, null),
  ('moisture_off_band','Moisture outside the expected band','v_xq_yield_miss','high',
   true, time '21:00', time '07:00', false, 3, 7,
   'Band from f_rule(expected_moisture_pct_min/max); goal moisture_loss_goal_pct.'),
  ('fail_no_coa','Failed test with no COA','v_xq_failed_no_disposition','high',
   true, time '21:00', time '07:00', false, 2, 5, null),
  ('three_fail_streak','Three consecutive failed tests','v_xq_failed_no_disposition','critical',
   true, null, null, true, 1, 1, 'Streak of three is treated as a process failure, not three incidents.'),
  ('schedule_tamper','Schedule edited after the week started','v_xq_schedule_tamper','critical',
   true, null, null, true, 1, 1,
   'The target moved after the result was known. Ignores quiet hours.')
on conflict (rule_key) do nothing;

-- ===========================================================================
-- 6. CULTIVATION DASHBOARD HOME
-- ===========================================================================
create or replace view v_dept_dash_cultivation as
select 'Cultivation'::text as department, ord, kpi, value, unit, tone, context, drill, now() as computed_at
from (
  select 10 as ord, 'Flowering plants standing' as kpi,
         (select sum(plants) from cult_room_plant_snapshot
           where taken_on=(select max(taken_on) from cult_room_plant_snapshot) and phase='Flowering')::numeric as value,
         'plants' as unit, 'info' as tone,
         'Across the four flower rooms, cultivation licence only. Mirror state, not a point-in-time export.' as context,
         'plant_census' as drill
  union all
  select 20, 'Rooms off cycle',
         (select count(*) from v_cult_harvest_calendar
           where status in ('SKIPPED','LATE','UNFINISHED')
             and scheduled_week_start >= current_date - 180)::numeric,
         'cuts', 'bad',
         'Scheduled cuts in the last 180 days that were skipped, late, or still open past the limit.',
         'xq_harvest_cycle'
  union all
  select 30, 'Destroys recorded, last 7 days',
         (select count(*) from metrc_rpt_plants_destroyed
           where destroyed_on >= current_date - 7)::numeric,
         'plants', 'attn',
         (select 'NOT A MEASUREMENT. The destroy feed holds ' || count(*)
                 || ' rows and none carry destroyed_on - it is 100% null. Newest phase_date is '
                 || coalesce(max(phase_date)::text,'unknown')
                 || '. This tile reads zero because the feed is undated, not because nothing was destroyed.'
            from metrc_rpt_plants_destroyed),
         'xq_hidden_destroy'
  union all
  select 40, 'Unexplained plant residual',
         (select sum(greatest(coalesce(residual,0),0)) from v_cult_plant_balance_daily)::numeric,
         'plants', 'bad',
         (select coalesce(max(gap_card),
                 'yesterday - harvested - destroyed = today, per room. Anything left over left the room with no record.')
            from v_cult_plant_balance_daily),
         'xq_hidden_destroy'
  union all
  -- Grades. harvest_grades and harvest_weights are BOTH EMPTY (measured 29 Aug
  -- 2026: 0 rows each). A grade split rendered from an empty table would be four
  -- zeroes that read as "we graded nothing as A" rather than "nobody has entered
  -- a grade yet". WO-005: name the gap and what would fill it.
  select 45, 'Graded harvests',
         (select count(*) from harvest_grades)::numeric,
         'harvests', 'attn',
         (select case when count(*) = 0
                 then 'NOT A MEASUREMENT. harvest_grades holds 0 rows and harvest_weights holds '
                      || (select count(*) from harvest_weights)
                      || '. No grade split can be shown, and none is shown. WHAT WOULD FILL IT: '
                      || 'post-harvest grading entered against a harvest, or a Metrc package '
                      || 'breakdown mapped to grade. Until then this is a gap, not a zero.'
                 else count(*) || ' harvests carry a grade split.' end
            from harvest_grades),
         'harvest_grades'
  union all
  select 50, 'Cuts due in the next 7 days',
         (select count(*) from v_cult_harvest_calendar
           where status='DUE' and scheduled_week_start
                 between date_trunc('week',current_date)::date and current_date+7)::numeric,
         'cuts', 'info',
         'From cult_cycle_policy: 56-day cycle, 14-day stagger, cut on the room''s harvest_weekday.',
         'xq_harvest_cycle'
) t order by ord;

-- ===========================================================================
-- 7. REGISTRY
-- ===========================================================================
insert into nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref,
   description, enabled, admin_only, page_kind, default_range, module)
select 'Cultivation',
       coalesce((select min(category_order) from nav_registry where category='Cultivation'), 20),
       v.label,
       coalesce((select max(item_order) from nav_registry where category='Cultivation'),100) + v.bump,
       'alert-triangle', v.view_key, v.table_ref, v.descr,
       true, false, 'queue', 'as_of_now', 'Cultivation'
  from (values
    ('xq_hidden_destroy','Hidden Destroy','v_xq_hidden_destroy',2,'Plants that left a room with no harvest and no destroy record.'),
    ('xq_room_short','Room Short','v_xq_room_short',3,'Flower rooms holding fewer plants than their target.'),
    ('xq_yield_miss','Yield Miss','v_xq_yield_miss',4,'Cuts under the dried floor, or moisture outside the expected band.'),
    ('xq_schedule_tamper','Schedule Tamper','v_xq_schedule_tamper',5,'Cycle schedule edited after the affected week had already started.'),
    ('cult_dashboard','Cultivation Dashboard','v_dept_dash_cultivation',1,'Rooms, cycle, destroys, residual and yield in one place.')
  ) as v(view_key,label,table_ref,bump,descr)
 where not exists (select 1 from nav_registry n where n.view_key = v.view_key);

insert into nav_role_visibility (view_key, role, visible)
select k.view_key, v.role, v.visible
  from (values ('xq_hidden_destroy'),('xq_room_short'),('xq_yield_miss'),
               ('xq_schedule_tamper'),('cult_dashboard')) as k(view_key)
  cross join lateral (select role, visible from nav_role_visibility
                       where view_key='xq_metrc_exceptions') v
on conflict (view_key, role) do nothing;

grant select on cult_room_plant_snapshot, cult_schedule_snapshot, notify_rules,
                v_cult_plant_balance_daily, v_cult_schedule_tamper,
                v_xq_hidden_destroy, v_xq_room_short, v_xq_yield_miss,
                v_xq_schedule_tamper, v_dept_dash_cultivation
  to authenticated, anon;
