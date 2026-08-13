-- Agent I, 13 Aug 2026. DBI-106.
--
-- OWNER: "Convert and add buttons for team to add these" and "also be sure we can edit all
-- fields here", on the schedule-compliance table showing Pull 15/15/12 and Dry 23/0/23.
--
-- TWO DIFFERENT THINGS, and the distinction is the fix.
--
-- 1. THE NUMBER SHOULD BE COMPUTED, NEVER TYPED. days_off_schedule is filled on all 15 Pull rows
--    and on NONE of the 23 Dry rows, so the dashboard counted 8 while the dates themselves say
--    30-odd events ran late. Nobody omitted it on purpose - a hand-maintained column is filled
--    for the case its author had in mind and forgotten for the next one. actual_date minus
--    scheduled_date cannot be forgotten, and the Dry rows are the worse half: TG Apple Fritter
--    scheduled to finish drying 13 Jul, actually 27 Jul. Spec Ops, Blue Dream and Blueberry
--    Muffin all scheduled 27 Jul, all actually 10 Aug. FOURTEEN DAYS, every one.
--
-- 2. WHAT A PERSON ADDS IS THE REASON, not the arithmetic. Only the grower knows the room ran hot
--    or the trim crew was short. That is what the buttons are for.
--
-- IT USES THE REASON MACHINERY THAT ALREADY EXISTS. reason_code_catalog holds 20 codes and
-- reason_policy holds 11 rules; both were built and neither governs anything here. Eight codes
-- carry an EMPTY applies_to array - they apply to everything - and those are the general ones a
-- schedule variance needs: OWNER_DIRECTED, ACCEPTED_RISK, BUSINESS_AS_INTENDED, MEASUREMENT_ERROR
-- and so on. A parallel list of reasons would be the duplicate-definition defect again, so this
-- adds SCHEDULE-specific codes to that same catalogue rather than starting a second one.
--
-- EVERY FIELD IS EDITABLE, as he asked: reason, note, who is accountable, the corrective action,
-- and whether it is resolved. Corrections are an UPDATE with a stamp, not a delete - a variance
-- that quietly disappears is the record of a problem disappearing.
--
-- NOTHING IS ASSUMED. No variance is pre-filled with a guessed reason. An unexplained one reads
-- "no reason recorded yet" and stays in the queue until a person says why.
--
-- UNDO: drop view v_schedule_variance; drop table schedule_variance;
--       delete from reason_code_catalog where 'schedule_variance' = any(applies_to).

insert into reason_code_catalog (code, label, description, applies_to, requires_note, active, sort_order)
values
 ('SCHED_WEATHER_OR_ROOM','Room or environment','The room ran hot, cold or humid and the crop was not ready on the planned day.','{schedule_variance}',false,true,10),
 ('SCHED_CROP_NOT_READY','Crop not ready','Trichomes, moisture or plant condition said wait. Pulling on the date would have cost quality.','{schedule_variance}',false,true,20),
 ('SCHED_LABOUR','Labour','Not enough crew that day, or the crew was pulled to something else.','{schedule_variance}',true,true,30),
 ('SCHED_EQUIPMENT','Equipment','A dryer, a trimmer or a room was down.','{schedule_variance}',true,true,40),
 ('SCHED_SPACE','No space downstream','Nowhere to put it — dry rooms or vaults were full.','{schedule_variance}',false,true,50),
 ('SCHED_PLAN_WAS_WRONG','The plan was wrong','The scheduled date was never achievable. Fix the plan, not the crew.','{schedule_variance}',true,true,60),
 ('SCHED_DATE_NOT_RECORDED','Date not recorded','It happened on time; nobody wrote it down. A record-keeping variance, not an operational one.','{schedule_variance}',false,true,70)
on conflict (code) do nothing;

create table if not exists schedule_variance (
  id             bigserial primary key,
  event_type     text not null,
  room           text not null,
  cultivars      text,
  scheduled_date date not null,
  actual_date    date,
  reason_code    text references reason_code_catalog(code),
  note           text,
  accountable    text,
  corrective_action text,
  resolved       boolean not null default false,
  resolved_by    text,
  resolved_at    timestamptz,
  recorded_by    text not null default 'unrecorded',
  recorded_at    timestamptz not null default now(),
  updated_by     text,
  updated_at     timestamptz,
  unique (event_type, room, scheduled_date)
);

alter table schedule_variance enable row level security;
drop policy if exists sv_read  on schedule_variance;
drop policy if exists sv_write on schedule_variance;
create policy sv_read  on schedule_variance for select to authenticated using (true);
create policy sv_write on schedule_variance for all to authenticated using (true) with check (true);

comment on table schedule_variance is
 'Why a pull or a dry missed its date. The DAYS are never stored here - they are computed from '
 'the dates in v_schedule_variance, because the hand-kept days_off_schedule column was filled on '
 'all 15 Pull rows and none of the 23 Dry rows, so the dashboard reported 8 while the dates said '
 '30-odd. What a person adds is the REASON, which no arithmetic can supply. Every field is '
 'editable by the team; a correction is an update with a stamp, never a delete, because a '
 'variance that disappears is a problem disappearing.';

create or replace function tg_record_schedule_variance(
  p_event_type text, p_room text, p_scheduled_date date,
  p_reason_code text default null, p_note text default null,
  p_accountable text default null, p_corrective_action text default null,
  p_resolved boolean default null)
returns bigint
language plpgsql security invoker set search_path = public as $$
declare v_id bigint; v_actual date; v_cult text; v_needs_note boolean;
begin
  select sc.actual_date, sc.cultivars into v_actual, v_cult
  from v_schedule_compliance sc
  where sc.event_type = p_event_type and sc.room = p_room
    and sc.scheduled_date = p_scheduled_date
  limit 1;

  if p_reason_code is not null then
    select rc.requires_note into v_needs_note
    from reason_code_catalog rc where rc.code = p_reason_code and rc.active;
    if not found then
      raise exception
        'No active reason code "%". Pick one from reason_code_catalog — a free-text reason '
        'cannot be counted, and counting is the point.', p_reason_code;
    end if;
    if v_needs_note and length(btrim(coalesce(p_note,''))) < 10 then
      raise exception
        'Reason "%" needs a note saying what actually happened. It was chosen because the code '
        'alone does not explain it.', p_reason_code;
    end if;
  end if;

  insert into schedule_variance
    (event_type, room, cultivars, scheduled_date, actual_date, reason_code, note,
     accountable, corrective_action, resolved, recorded_by,
     resolved_by, resolved_at)
  values (p_event_type, p_room, v_cult, p_scheduled_date, v_actual, p_reason_code, p_note,
          p_accountable, p_corrective_action, coalesce(p_resolved,false),
          coalesce(current_app_role(),'unrecorded'),
          case when p_resolved then coalesce(current_app_role(),'unrecorded') end,
          case when p_resolved then now() end)
  on conflict (event_type, room, scheduled_date) do update
     set reason_code       = coalesce(excluded.reason_code, schedule_variance.reason_code),
         note              = coalesce(excluded.note, schedule_variance.note),
         accountable       = coalesce(excluded.accountable, schedule_variance.accountable),
         corrective_action = coalesce(excluded.corrective_action, schedule_variance.corrective_action),
         actual_date       = coalesce(excluded.actual_date, schedule_variance.actual_date),
         resolved          = coalesce(p_resolved, schedule_variance.resolved),
         resolved_by       = case when p_resolved then coalesce(current_app_role(),'unrecorded')
                                  else schedule_variance.resolved_by end,
         resolved_at       = case when p_resolved then now() else schedule_variance.resolved_at end,
         updated_by        = coalesce(current_app_role(),'unrecorded'),
         updated_at        = now()
  returning id into v_id;

  return v_id;
end $$;

grant execute on function tg_record_schedule_variance(text,text,date,text,text,text,text,boolean)
  to authenticated;

comment on function tg_record_schedule_variance is
 'The button behind every row: record or edit why an event missed its date. Every field is '
 'optional and every field is editable — passing null leaves a value alone rather than wiping it, '
 'so a second person can add a corrective action without knowing what the first person wrote. '
 'A reason code must exist in reason_code_catalog: free text cannot be counted, and counting is '
 'why the reason is collected at all.';

create or replace view public.v_schedule_variance as
select sc.event_type, sc.room, sc.cultivars, sc.scheduled_date, sc.actual_date,
       -- COMPUTED. Never the stored column, which is null on all 23 Dry rows.
       (sc.actual_date - sc.scheduled_date)                        as days_late,
       case when sc.actual_date is null then 'not yet happened'
            when sc.actual_date = sc.scheduled_date then 'on the day'
            when sc.actual_date > sc.scheduled_date
              then (sc.actual_date - sc.scheduled_date)||' days late'
            else abs(sc.actual_date - sc.scheduled_date)||' days early' end as timing,
       v.reason_code, rc.label as reason, rc.requires_note,
       v.note, v.accountable, v.corrective_action,
       v.resolved, v.resolved_by, v.resolved_at, v.recorded_by, v.updated_by, v.updated_at,
       case when sc.actual_date is null then null
            when sc.actual_date = sc.scheduled_date then null
            when v.reason_code is null
              then 'No reason recorded yet — only the grower knows why this slipped, and the '
                   'platform will not invent one.'
       end                                                         as what_is_missing,
       sc.planned_lbs, sc.planned_plants
from v_schedule_compliance sc
left join schedule_variance v
  on v.event_type = sc.event_type and v.room = sc.room and v.scheduled_date = sc.scheduled_date
left join reason_code_catalog rc on rc.code = v.reason_code
where sc.scheduled_date is not null;

comment on view public.v_schedule_variance is
 'Every scheduled pull and dry, how late it actually ran, and why — with the days COMPUTED from '
 'the dates rather than read from the hand-kept days_off_schedule column, which is filled on all '
 '15 Pull rows and none of the 23 Dry rows. That gap is why the dashboard reported 8 events off '
 'schedule while the dates say 30-odd, and why the 14-day drying slips were invisible. '
 'what_is_missing names an unexplained variance instead of leaving a blank that reads as fine.';;
