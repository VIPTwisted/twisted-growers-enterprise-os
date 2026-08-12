-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-016 (reviewers V, X, W).
-- Owner ruling 11 Aug 2026: "red alert if exceeds 14 days old, which alerts new alert each day
-- until resolved. Do NOT allow user to ignore. Must state reason for putting off correcting WITH
-- EACH ALERT."
--
-- WHAT ALREADY EXISTED, and is therefore NOT rebuilt here:
--   harvest_alert_rules.dry_max_days .... 14 days, severity critical, "dry day 14 is the outer
--                                         limit" from the 8-week calendar. The owner's threshold
--                                         is already law.
--   item_alert_route .................... critical reminds every 1 day, escalates to executive
--                                         after 2 and to owner after 3. Daily repeat exists.
--   reason_policy.flag_ignore ........... already requires a reason code, a 25-character note and
--                                         a review date.
--   reason_code_catalog ................. controlled vocabulary, because free text cannot be
--                                         counted or trended.
--
-- THE ACTUAL GAP, WHICH IS THE OWNER'S LAST CLAUSE. Today a person defers ONCE, sets a review
-- date, and the alert goes quiet until that date. The owner wants the opposite: the alert returns
-- tomorrow, and tomorrow needs its OWN reason. A single deferral must not buy silence.
--
-- WHY THAT MATTERS MORE THAN IT SOUNDS. A one-off deferral converts a live problem into a diary
-- entry, and the diary is where 108 custody findings went to reach a week old and a lineage break
-- reached 966 days. Requiring a fresh sentence every day makes the cost of not fixing something
-- visible and repeated, and it produces a written record of exactly why nobody acted - which is
-- the first thing an examiner asks for.
--
-- HOW IT IS ENFORCED. unique (alert_key, deferred_on) means one deferral per alert PER DAY. A
-- deferral cannot be written for a future date, so nobody can pre-silence a week. The trigger
-- reads reason_policy rather than hardcoding the rules, so the owner can tighten them without a
-- migration.
--
-- IGNORE IS NOT AVAILABLE ON A RED AGEING ALERT. Recorded as policy: deferral yes, with a reason,
-- daily. Silence no. The escalation ladder in item_alert_route continues regardless of deferral -
-- deferring does not pause the clock, it only records why the clock is being allowed to run.
--
-- UNDO: drop trigger trg_deferral_needs_todays_reason on alert_deferral;
--       drop function tg_deferral_needs_todays_reason(); drop table alert_deferral;
--       delete from reason_policy where action_key = 'flag_defer';

insert into reason_policy
 (action_key, label, plain_english, enforced, require_code, require_note, min_note_chars,
  require_review_date, require_second_approver, set_by)
values
 ('flag_defer', 'Put off correcting a flag for one day',
  'Every day you leave a red flag uncorrected you must say why, in your own words, that day. '
  'Yesterday''s reason does not carry over. You cannot ignore a red ageing flag - you can only '
  'defer it, one day at a time, on the record.',
  true, true, true, 25, false, false, 'Owner (Vinny), 11 Aug 2026')
on conflict (action_key) do update set
  label = excluded.label, plain_english = excluded.plain_english, enforced = excluded.enforced,
  require_code = excluded.require_code, require_note = excluded.require_note,
  min_note_chars = excluded.min_note_chars, set_by = excluded.set_by;

create table if not exists alert_deferral (
  id             bigserial primary key,
  alert_key      text not null,
  alert_source   text,
  deferred_on    date not null default current_date,
  deferred_by    text not null,
  reason_code    text not null,
  reason_note    text not null,
  what_i_will_do text,
  age_days_at_deferral integer,
  created_at     timestamptz not null default now(),
  unique (alert_key, deferred_on)
);

alter table alert_deferral enable row level security;

comment on table alert_deferral is
 'One row per flag per DAY it is put off. The unique key on (alert_key, deferred_on) is the whole '
 'control: yesterday''s reason buys nothing today, so a person must write a fresh sentence every '
 'day a red flag stays uncorrected. Owner ruling 11 Aug 2026 - a user may not ignore a red ageing '
 'alert, only defer it, one day at a time, on the record. Deferring does NOT pause the escalation '
 'ladder in item_alert_route; it records why the clock is being allowed to run.';

comment on column alert_deferral.deferred_on is
 'The day this deferral covers. Cannot be in the future - nobody pre-silences a week.';

comment on column alert_deferral.reason_note is
 'The person''s own words, minimum length taken live from reason_policy so the owner can tighten '
 'it without a migration. "Waiting on lab" repeated for fourteen days is itself a finding, and '
 'having it written down fourteen times is what makes that visible.';

create index if not exists alert_deferral_by_alert on alert_deferral (alert_key, deferred_on desc);

create or replace function public.tg_deferral_needs_todays_reason()
returns trigger language plpgsql as $fn$
declare p record;
begin
  select * into p from reason_policy where action_key = 'flag_defer';

  if new.deferred_on > current_date then
    raise exception
      'Cannot defer % to a future date. A deferral covers ONE day and must be written on that '
      'day. Pre-silencing a flag for a week is the behaviour this control exists to stop.',
      new.alert_key;
  end if;

  if p.enforced then
    if p.require_code and coalesce(btrim(new.reason_code), '') = '' then
      raise exception 'Cannot defer %: a reason code is required.', new.alert_key;
    end if;
    if p.require_code and not exists (
         select 1 from reason_code_catalog c where c.code = new.reason_code) then
      raise exception
        'Cannot defer %: reason code "%" is not in reason_code_catalog. Free text cannot be '
        'counted or trended, which is why the vocabulary is controlled.', new.alert_key, new.reason_code;
    end if;
    if p.require_note and length(btrim(coalesce(new.reason_note, ''))) < coalesce(p.min_note_chars, 25) then
      raise exception
        'Cannot defer %: the reason must be at least % characters in your own words. You wrote %. '
        'Say what is actually blocking the correction.',
        new.alert_key, coalesce(p.min_note_chars, 25), length(btrim(coalesce(new.reason_note, '')));
    end if;
  end if;

  return new;
end $fn$;

create trigger trg_deferral_needs_todays_reason
  before insert or update on alert_deferral
  for each row execute function tg_deferral_needs_todays_reason();

create or replace view v_deferral_pressure as
select d.alert_key,
       d.alert_source,
       count(*)                                   as days_deferred,
       min(d.deferred_on)                         as first_deferred,
       max(d.deferred_on)                         as last_deferred,
       (current_date - max(d.deferred_on))        as days_since_last_reason,
       max(d.age_days_at_deferral)                as age_days,
       count(distinct d.deferred_by)              as people_involved,
       count(distinct d.reason_note)              as distinct_reasons_given,
       (array_agg(d.reason_code order by d.deferred_on desc))[1] as latest_reason_code,
       (array_agg(d.reason_note order by d.deferred_on desc))[1] as latest_reason,
       case
         when count(*) >= 14 then 'CHRONIC — deferred a fortnight; this is a decision not to fix, and it should be taken openly'
         when count(*) >= 7  then 'REPEATED — a week of deferrals'
         when count(distinct d.reason_note) = 1 and count(*) >= 3
              then 'SAME REASON REPEATED — if the blocker has not changed in ' || count(*) || ' days, escalate the blocker'
         else 'ACTIVE'
       end as verdict
from alert_deferral d
group by d.alert_key, d.alert_source
order by count(*) desc;

comment on view v_deferral_pressure is
 'Which flags are being put off, by whom, and whether the same excuse keeps appearing. The point '
 'is not to police people - it is that a reason repeated seven times is a blocker nobody has '
 'escalated. SAME REASON REPEATED means fix the blocker, not the flag.';;
