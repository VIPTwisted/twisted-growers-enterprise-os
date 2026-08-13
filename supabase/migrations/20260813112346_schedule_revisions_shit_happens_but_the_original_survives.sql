-- Agent I, 13 Aug 2026. DBI-108.
--
-- OWNER: "USERS WITH PERMISSIONS MUST BE ABLE TO ADJUST HARVEST SCHEUDLE AS SHIT HAPPENS AND HAVE
-- AREA FOR NOTES".
--
-- THE ONE THING THIS MUST NOT ALLOW, and it is the whole design. If a person can move the
-- scheduled date, every late pull can be made on-time by editing the plan after the fact. The
-- owner's hard rule the same morning was "HARVEST CAN BE TAKEN DOWN FEW DAYS EARLY BUT NOT LATE.
-- EVERYTHING MUST STRICLY FOLLOW THIS" - and a schedule that can be edited in place quietly
-- deletes that rule. Nobody would have to intend it: you move a date because the crew was short,
-- and a violation disappears as a side effect.
--
-- SO: THE ORIGINAL DATE ALWAYS SURVIVES. A revision is a NEW ROW recording what moved, from what,
-- to what, why and by whom. Adherence is still measured against the ORIGINAL commitment, with the
-- revision shown beside it. Both facts stay true at once - the plan changed, AND the original
-- date was missed - which is what an honest record has to hold.
--
-- The pattern already exists in this schema and was never used this way: harvest_pull_details
-- carries original_harvest_date and original_availability_date on all 141 rows.
--
-- A REASON IS MANDATORY. Not because process demands paperwork, but because seven late pulls
-- today (worst 11 days, F2) have no recorded cause, so nobody can tell whether it is one room,
-- one crew, one season or one bad plan. A date change with no reason is the same information as
-- no date change.
--
-- WHO CAN DO IT: owner, executive, admin and manager. Deliberately wider than the owner-only
-- gates elsewhere - "shit happens" is a floor decision made by whoever is standing in the room,
-- and a rule that requires the owner at 6am is a rule that gets worked around.
--
-- NOTHING IS DELETED, EVER. A revision that was itself wrong is superseded by another revision.
--
-- UNDO: drop view v_schedule_revisions; drop function tg_revise_harvest_schedule;
--       drop table schedule_revision.

create table if not exists schedule_revision (
  id              bigserial primary key,
  event_type      text not null default 'Pull',
  room            text not null,
  original_date   date not null,
  previous_date   date not null,
  new_date        date not null,
  reason_code     text references reason_code_catalog(code),
  note            text not null check (length(btrim(note)) >= 10),
  revised_by      text not null,
  revised_at      timestamptz not null default now(),
  superseded_by   bigint references schedule_revision(id),
  constraint the_date_actually_moved check (new_date <> previous_date)
);
create index if not exists sr_room_date on schedule_revision (room, original_date);

alter table schedule_revision enable row level security;
drop policy if exists sr_read  on schedule_revision;
drop policy if exists sr_write on schedule_revision;
create policy sr_read on schedule_revision for select to authenticated using (true);
create policy sr_write on schedule_revision for all to authenticated
  using (exists (select 1 from app_users u where u.user_id = auth.uid()
                   and u.role::text in ('owner','executive','admin','manager')))
  with check (exists (select 1 from app_users u where u.user_id = auth.uid()
                   and u.role::text in ('owner','executive','admin','manager')));

comment on table schedule_revision is
 'Every change to a planned harvest date, with the reason. THE ORIGINAL DATE ALWAYS SURVIVES in '
 'original_date, and adherence is still measured against it — because a schedule that can be '
 'edited in place lets every late pull be made on-time after the fact, which would quietly delete '
 'the owner''s hard rule that a harvest may come down early but never late. Nobody would have to '
 'intend it: you move a date because the crew was short, and a violation vanishes as a side '
 'effect. Both facts stay true here — the plan changed, and the original date was missed. '
 'A note of at least ten characters is required: seven late pulls today have no recorded cause, '
 'so nobody can say whether it is one room, one crew, one season or one bad plan.';

create or replace function tg_revise_harvest_schedule(
  p_room text, p_original_date date, p_new_date date,
  p_note text, p_reason_code text default null, p_event_type text default 'Pull')
returns bigint
language plpgsql security invoker set search_path = public as $$
declare v_id bigint; v_prev date; v_role text; v_needs_note boolean;
begin
  select u.role::text into v_role from app_users u where u.user_id = auth.uid();
  if v_role is null or v_role not in ('owner','executive','admin','manager') then
    raise exception
      'Changing a harvest date needs owner, executive, admin or manager. The original date is '
      'kept either way — adherence is always measured against the first commitment.'
      using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_note,''))) < 10 then
    raise exception
      'Say what happened, in a sentence. A date change with no reason carries the same '
      'information as no date change, and seven late pulls already have no recorded cause.'
      using errcode = '22023';
  end if;

  if p_reason_code is not null then
    select rc.requires_note into v_needs_note
      from reason_code_catalog rc where rc.code = p_reason_code and rc.active;
    if not found then
      raise exception 'No active reason code "%". Pick one from reason_code_catalog.', p_reason_code;
    end if;
  end if;

  -- The latest known date for this room and original plan: the last revision, or the plan itself.
  select coalesce(
           (select r.new_date from schedule_revision r
             where r.room = p_room and r.original_date = p_original_date
               and r.superseded_by is null
             order by r.revised_at desc limit 1),
           p_original_date)
    into v_prev;

  if v_prev = p_new_date then
    raise exception 'That is already the planned date (%). Nothing to record.', v_prev;
  end if;

  insert into schedule_revision
    (event_type, room, original_date, previous_date, new_date, reason_code, note, revised_by)
  values (p_event_type, p_room, p_original_date, v_prev, p_new_date, p_reason_code,
          btrim(p_note), coalesce(v_role,'unrecorded'))
  returning id into v_id;

  return v_id;
end $$;

grant execute on function tg_revise_harvest_schedule(text,date,date,text,text,text) to authenticated;

comment on function tg_revise_harvest_schedule is
 'Move a planned harvest date and say why. Open to owner, executive, admin and manager — '
 'deliberately wider than the owner-only gates elsewhere, because this is a floor decision made '
 'by whoever is standing in the room, and a rule needing the owner at 6am is a rule that gets '
 'worked around. The original date is never overwritten.';

create or replace view public.v_schedule_revisions as
select r.room, r.event_type, r.original_date,
       r.new_date                                        as current_planned_date,
       r.previous_date, r.new_date - r.original_date     as days_moved_from_original,
       r.note, rc.label as reason, r.revised_by, r.revised_at,
       (r.superseded_by is not null)                     as superseded,
       (select count(*) from schedule_revision r2
         where r2.room = r.room and r2.original_date = r.original_date) as times_this_date_moved,
       case when r.new_date > r.original_date
              then 'Pushed LATER by ' || (r.new_date - r.original_date) ||
                   ' days. The original commitment stands in the adherence figure — moving the '
                   'plan does not make a late take-down on time.'
            else 'Pulled EARLIER by ' || (r.original_date - r.new_date) || ' days.' end
                                                         as what_this_means
from schedule_revision r
left join reason_code_catalog rc on rc.code = r.reason_code
order by r.revised_at desc;

comment on view public.v_schedule_revisions is
 'Every harvest date change, why, and by whom — with days_moved_from_original so a date that has '
 'drifted repeatedly is visible as drift rather than as a series of small reasonable moves. '
 'times_this_date_moved is the number worth watching: one change is an event, four is a plan that '
 'was never real.';;
