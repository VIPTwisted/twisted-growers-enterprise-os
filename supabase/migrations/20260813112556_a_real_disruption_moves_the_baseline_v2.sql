-- Agent I, 13 Aug 2026. DBI-109. Extends DBI-108 within the hour, on the owner's correction.
--
-- OWNER: "LET SAY LIGHTS OUT OR SOMETHING HAPPENS WE NEED TO BE ABLE TO ADJUST SCHEDULE FOR
-- HARVEST SO IT DOESNT FLAG REST OF YEAR AS LATE".
--
-- HE IS RIGHT AND DBI-108 WOULD HAVE DONE EXACTLY THE WRONG THING. I built it so adherence is
-- always measured against the ORIGINAL date, to stop a late pull being edited into an on-time one.
-- That protects the rule and breaks the business: a lights-out failure shifts every downstream
-- pull, and every one would read LATE for the rest of the year against dates that stopped being
-- achievable in week one. A guard that turns one incident into forty false violations does not get
-- respected — it gets ignored, and then it protects nothing.
--
-- TWO THINGS WERE BEING CALLED ONE:
--   * SLIPPING — the plan was achievable and we missed it. Original stands. Violation.
--   * DISRUPTION — lights out, equipment failure, a room lost. The BASELINE MOVES, and everything
--     downstream is measured against the new plan rather than one overtaken by events.
--
-- THE ABUSE IS OBVIOUS AND SO IS THE ANSWER. If a disruption resets the baseline, the temptation
-- is to call everything a disruption. It is NOT blocked — somebody has to be able to act at 6am —
-- it is COUNTED, beside every figure. A room resetting five times has not had five disruptions;
-- it has a plan that was never real. Making the pattern visible beats forbidding the act, which
-- only moves the lying somewhere nobody can see.
--
-- THE ORIGINAL SURVIVES EITHER WAY. A reset changes what we MEASURE AGAINST; it never erases what
-- was committed. Both facts stay: the plan was X, a disruption moved it to Y, and we hit Y.
--
-- CASCADE, because a lights-out does not politely affect one date: one action shifts this pull and
-- every later one in the room, each with its own revision row carrying the same reason, so the
-- cause is visible on every affected date and not only the first.
--
-- V2: v1 inserted resets_baseline mid-list in the view; create-or-replace cannot reorder columns.
-- Appended — the same append-only rule that has caught me four times today.
--
-- UNDO: drop the two columns; drop function tg_shift_schedule_after_disruption; restore the view.

alter table schedule_revision
  add column if not exists resets_baseline boolean not null default false;
alter table schedule_revision
  add column if not exists disruption_ref bigint;

comment on column schedule_revision.resets_baseline is
 'TRUE only when something made the plan impossible — lights out, equipment failure, a room lost. '
 'Adherence for this event and everything downstream is then measured against the NEW date, so one '
 'incident does not flag the rest of the year. FALSE when the plan was achievable and we simply '
 'moved it; the original stands and a late take-down is still a violation. Not blocked and '
 'deliberately counted: a room that resets its baseline five times has not had five disruptions.';

comment on column schedule_revision.disruption_ref is
 'The id of the first revision in a cascade. One lights-out shifts every later pull in the room, '
 'and each shifted date carries this so the cause is visible on all of them, not just the first.';

create or replace function tg_shift_schedule_after_disruption(
  p_room text, p_from_date date, p_shift_days integer,
  p_note text, p_reason_code text default null, p_cascade boolean default true)
returns table(room text, was date, now_planned date, revision_id bigint)
language plpgsql security invoker set search_path = public as $$
declare v_role text; v_first bigint; d record; v_prev date; v_id bigint;
begin
  select u.role::text into v_role from app_users u where u.user_id = auth.uid();
  if v_role is null or v_role not in ('owner','executive','admin','manager') then
    raise exception 'Shifting a schedule after a disruption needs owner, executive, admin or manager.'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note,''))) < 10 then
    raise exception
      'Say what happened. This resets what every downstream pull is measured against, so the reason '
      'is the only thing separating it from moving the goalposts.' using errcode = '22023';
  end if;
  if p_shift_days = 0 then
    raise exception 'A shift of zero days changes nothing.';
  end if;

  for d in
    select distinct hs.harvest_date, hs.flower_room
      from harvest_schedule hs
     where hs.flower_room = p_room
       and hs.harvest_date >= p_from_date
       and (p_cascade or hs.harvest_date = p_from_date)
     order by hs.harvest_date
  loop
    select coalesce(
             (select r.new_date from schedule_revision r
               where r.room = d.flower_room and r.original_date = d.harvest_date
                 and r.superseded_by is null
               order by r.revised_at desc limit 1),
             d.harvest_date)
      into v_prev;

    insert into schedule_revision
      (event_type, room, original_date, previous_date, new_date, reason_code, note,
       revised_by, resets_baseline, disruption_ref)
    values ('Pull', d.flower_room, d.harvest_date, v_prev, v_prev + p_shift_days, p_reason_code,
            btrim(p_note) || case when d.harvest_date <> p_from_date
                                  then ' [shifted by the disruption of ' || p_from_date || ']'
                                  else '' end,
            coalesce(v_role,'unrecorded'), true, v_first)
    returning id into v_id;

    if v_first is null then
      v_first := v_id;
      update schedule_revision set disruption_ref = v_id where id = v_id;
    end if;

    room := d.flower_room; was := v_prev; now_planned := v_prev + p_shift_days;
    revision_id := v_id;
    return next;
  end loop;
end $$;

grant execute on function tg_shift_schedule_after_disruption(text,date,integer,text,text,boolean)
  to authenticated;

comment on function tg_shift_schedule_after_disruption is
 'Lights out, a dead dryer, a room lost — shift this pull and every later one in the room by the '
 'same number of days, in one action, with one reason recorded on every affected date. It sets '
 'resets_baseline so downstream pulls are measured against the new plan instead of reading LATE '
 'for the rest of the year against dates that stopped being achievable. p_cascade false moves a '
 'single date.';

create or replace view public.v_schedule_revisions as
select r.room, r.event_type, r.original_date,
       r.new_date                                        as current_planned_date,
       r.previous_date, r.new_date - r.original_date     as days_moved_from_original,
       r.note, rc.label as reason, r.revised_by, r.revised_at,
       (r.superseded_by is not null)                     as superseded,
       (select count(*) from schedule_revision r2
         where r2.room = r.room and r2.original_date = r.original_date) as times_this_date_moved,
       case
         when r.resets_baseline
           then 'DISRUPTION — the baseline moved. This pull and everything after it in this room '
                'is measured against the new date, so one incident does not flag the rest of the '
                'year. The original ' || r.original_date || ' is kept and still visible.'
         when r.new_date > r.original_date
           then 'Pushed LATER by ' || (r.new_date - r.original_date) || ' days, and the original '
                'commitment still stands in the adherence figure — moving a plan does not make a '
                'late take-down on time.'
         else 'Pulled EARLIER by ' || (r.original_date - r.new_date) || ' days.'
       end                                               as what_this_means,
       -- appended 13 Aug 2026, DBI-109
       r.resets_baseline,
       r.disruption_ref,
       (select count(*) from schedule_revision r3
         where r3.room = r.room and r3.resets_baseline
           and r3.revised_at >= date_trunc('year', now())
           and r3.disruption_ref is distinct from r.disruption_ref) as other_baseline_resets_this_year
from schedule_revision r
left join reason_code_catalog rc on rc.code = r.reason_code
order by r.revised_at desc;

comment on view public.v_schedule_revisions is
 'Every harvest date change and why. resets_baseline separates a real disruption, which moves what '
 'we measure against, from ordinary slipping, which does not. other_baseline_resets_this_year is '
 'the number to watch: resetting is never blocked, because somebody has to act at 6am, but a room '
 'that resets five times has not had five disruptions — it has a plan that was never real.';;
