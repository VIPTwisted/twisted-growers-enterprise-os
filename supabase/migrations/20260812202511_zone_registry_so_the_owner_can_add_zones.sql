-- Agent I, 12 Aug 2026. DBI-080.
--
-- OWNER: "you need to setup backend for zones so i can add zones."
--
-- This un-parks the ZONE half of the work he deferred earlier ("LETS ADD SCHDULING EMPLOYEES AND
-- ZONE UNTIL LATER AFTER HR IS COMPLETED BY OTHER AGENT"). Scheduling and attendance stay parked;
-- only the zone registry is built, because he wants to start defining zones now.
--
-- WHAT ALREADY EXISTS, measured before building: employee_schedules carries a `zone` TEXT column
-- and time_entries carries `in_zone_at` — both empty. So the CONCEPT exists as free text with no
-- vocabulary behind it, which is how "F1" and "Flower Room #1" became two names for one room
-- earlier today. A registry is the fix and it is the same shape as room_alias for the same reason.
--
-- THE QUESTION HE NEVER ANSWERED, AND WHY IT DOES NOT BLOCK. I asked whether a zone is a room, a
-- group of rooms, or an area inside one. Rather than pick for him, `rooms` is an ARRAY and may be
-- empty: one room, several rooms, or none at all for a zone that is not room-shaped (a loading
-- dock, a bench, a line). All three readings work and he can settle it by the zones he actually
-- creates.
--
-- I DO NOT TOUCH employee_schedules. It belongs to the HR module and another designer owns it, so
-- no foreign key is added to it. Instead v_zone_vocabulary_drift reports any schedule row naming
-- a zone that is not registered — a report, not a constraint on someone else's table.
--
-- UNDO: drop view v_zone_vocabulary_drift, v_zone_board; drop functions tg_add_zone,
--       tg_rename_zone, tg_retire_zone; drop table zone.

create table if not exists zone (
  zone_key    text primary key
              constraint zone_key_is_a_slug check (zone_key ~ '^[a-z0-9_-]{2,40}$'),
  name        text not null,
  department  text,
  rooms       text[] not null default '{}',
  capacity    int check (capacity is null or capacity > 0),
  what_happens_here text,
  active      boolean not null default true,
  sort        int not null default 100,
  created_by  text not null default 'Owner',
  created_at  timestamptz not null default now(),
  retired_at  timestamptz,
  retired_why text
);

create index if not exists zone_active on zone (active, sort);

alter table zone enable row level security;
drop policy if exists zone_read  on zone;
drop policy if exists zone_write on zone;
create policy zone_read  on zone for select to authenticated using (true);
create policy zone_write on zone for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table zone is
 'Where people work, as a controlled vocabulary. Built 12 Aug 2026 on the owner''s request to add '
 'zones himself. `rooms` is an ARRAY and may be EMPTY on purpose: a zone can be one room, several '
 'rooms, or no room at all (a loading dock, a packaging line, a bench). He was asked whether a '
 'zone is a room, a group, or an area inside one and had not answered — this supports all three '
 'so the answer emerges from the zones he creates rather than being guessed. A registry rather '
 'than free text because "F1" and "Flower Room #1" became two names for one room earlier today '
 'and broke a drill; the same failure is waiting in employee_schedules.zone, which is TEXT with '
 'nothing behind it.';
comment on column zone.rooms is
 'Metrc room names, matching room_alias.metrc_name. Empty means the zone is not room-shaped, '
 'which is legitimate.';
comment on column zone.retired_at is
 'Zones are RETIRED, never deleted — a past schedule or punch must still resolve the zone it '
 'named. ALL DATA IS KEPT FOREVER.';

create or replace function tg_add_zone(
  p_name text, p_department text default null, p_rooms text[] default '{}',
  p_capacity int default null, p_what_happens_here text default null)
returns text
language plpgsql security invoker set search_path = public as $$
declare v_key text; bad text;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'A zone needs a name people would actually say out loud.';
  end if;

  v_key := btrim(left(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '_', 'g'), 40), '_-');
  if v_key !~ '^[a-z0-9_-]{2,40}$' then
    raise exception 'Could not make a usable key from "%". Try a name with letters in it.', p_name;
  end if;
  if exists (select 1 from zone where zone_key = v_key) then
    raise exception 'A zone called "%" already exists. Rename that one or choose another name.', p_name;
  end if;

  -- A room that is not in room_alias is almost always a typo, and a typo here recreates exactly
  -- the F1-versus-Flower-Room-#1 defect this registry exists to prevent.
  select string_agg(r, ', ') into bad
  from unnest(coalesce(p_rooms,'{}')) r
  where not exists (select 1 from room_alias a where a.metrc_name = r or a.our_name = r);
  if bad is not null then
    raise exception
      'Not a known room: %. Rooms must match room_alias (Metrc''s name or ours). '
      'Leave rooms empty if this zone is not a room.', bad;
  end if;

  insert into zone (zone_key, name, department, rooms, capacity, what_happens_here)
  values (v_key, btrim(p_name), nullif(btrim(coalesce(p_department,'')),''),
          coalesce(p_rooms,'{}'), p_capacity, nullif(btrim(coalesce(p_what_happens_here,'')),''));
  return v_key;
end $$;

comment on function tg_add_zone(text, text, text[], int, text) is
 'Adds a zone. Rejects a room name absent from room_alias, because a typo there recreates the '
 'exact two-names-for-one-room defect that broke a drill on 12 Aug 2026.';

create or replace function tg_rename_zone(p_key text, p_name text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_name is null or btrim(p_name) = '' then raise exception 'A zone needs a name.'; end if;
  update zone set name = btrim(p_name) where zone_key = p_key;
  if not found then raise exception 'No zone "%".', p_key; end if;
end $$;

create or replace function tg_retire_zone(p_key text, p_why text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_why is null or length(btrim(p_why)) < 10 then
    raise exception 'Say why the zone is being retired — a future reader will need it.';
  end if;
  update zone set active = false, retired_at = now(), retired_why = btrim(p_why)
   where zone_key = p_key;
  if not found then raise exception 'No zone "%".', p_key; end if;
end $$;

comment on function tg_retire_zone(text, text) is
 'Retires a zone. Never deletes: a past schedule or punch must still resolve the zone it named.';

create or replace view public.v_zone_board as
select z.zone_key, z.name, z.department, z.rooms, z.capacity, z.what_happens_here,
       z.active, z.sort,
       cardinality(z.rooms)                                        as room_count,
       (select round(sum(b.lb_held),1) from v_room_board_complete b
         where b.metrc_room_name = any(z.rooms))                   as lb_in_zone,
       (select sum(b.plants_now) from v_room_board_complete b
         where b.metrc_room_name = any(z.rooms))                   as plants_in_zone,
       case when cardinality(z.rooms) = 0
            then 'Not tied to a room — this zone is an area, a line or a bench.'
       end                                                         as why_no_rooms
from zone z
where z.active
order by z.sort, z.name;

comment on view public.v_zone_board is
 'Active zones with what is physically in them, joined through room_alias so a zone and the room '
 'board always agree. A zone with no rooms says so in words rather than showing a blank.';

create or replace view public.v_zone_vocabulary_drift as
select s.zone as zone_named_on_a_schedule,
       count(*) as schedule_rows,
       'This zone is named on a schedule but is not in the zone registry. Either add it with '
       'tg_add_zone or correct the schedule — free-text zones are how "F1" and "Flower Room #1" '
       'became two names for one room.' as what_to_do
from employee_schedules s
where nullif(btrim(coalesce(s.zone,'')),'') is not null
  and not exists (select 1 from zone z where z.zone_key = s.zone or z.name = s.zone)
group by s.zone;

comment on view public.v_zone_vocabulary_drift is
 'Reports any zone named on a schedule that is not registered. A REPORT, not a constraint: '
 'employee_schedules belongs to the HR module and another designer owns it, so no foreign key is '
 'imposed on their table. Empty today because employee_schedules holds no rows.';;
