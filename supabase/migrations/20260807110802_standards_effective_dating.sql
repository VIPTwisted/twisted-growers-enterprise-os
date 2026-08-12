/* EFFECTIVE-DATED STANDARDS
   -------------------------
   The standards register holds one value per rule. Change 380 lb to 400 next
   year and every month in history is silently re-judged against 400 - a month
   that met target becomes a month that missed, and nobody can tell why the
   number moved. This is the one design decision with a deadline, because once
   an old value is overwritten it is gone.

   Slowly-changing-dimension type 2. conversion_factors keeps holding the
   CURRENT value, so nothing that reads it changes. Every previous value is
   preserved with the window it applied to.

   f_rule_at(key, date) answers "what was the standard on this date" - which is
   what any finding about the past must be judged against. */

create table if not exists conversion_factor_history (
  id            bigserial primary key,
  key           text not null,
  value         numeric not null,
  unit          text,
  set_by        text,
  where_it_came_from text,
  valid_from    timestamptz not null,
  valid_to      timestamptz,                     -- null = still in force
  superseded_by text,
  recorded_at   timestamptz not null default now()
);
create index if not exists cfh_key_window on conversion_factor_history (key, valid_from desc);
create unique index if not exists cfh_one_current on conversion_factor_history (key) where valid_to is null;

alter table conversion_factor_history enable row level security;
drop policy if exists cfh_read on conversion_factor_history;
create policy cfh_read on conversion_factor_history for select to authenticated using (true);
grant select on conversion_factor_history to authenticated;

/* Seed history from the current values, back-dated to when each was set. */
insert into conversion_factor_history (key, value, unit, set_by, where_it_came_from, valid_from)
select c.key, c.value, c.unit, c.set_by, c.where_it_came_from, c.updated_at
from conversion_factors c
where not exists (select 1 from conversion_factor_history h where h.key = c.key)
on conflict do nothing;

/* Any change from now on closes the old window and opens a new one. */
create or replace function tg_track_rule_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return new;                       -- wording changed, not the number
  end if;
  update conversion_factor_history
     set valid_to = now(), superseded_by = coalesce(new.set_by,'unknown')
   where key = new.key and valid_to is null;
  insert into conversion_factor_history
    (key, value, unit, set_by, where_it_came_from, valid_from)
  values (new.key, new.value, new.unit, new.set_by, new.where_it_came_from, now());
  return new;
end $$;

drop trigger if exists trg_track_rule_change on conversion_factors;
create trigger trg_track_rule_change
  after insert or update on conversion_factors
  for each row execute function tg_track_rule_change();

/* What was the standard on a given date? The only honest way to judge the past. */
create or replace function f_rule_at(p_key text, p_when timestamptz default now())
returns numeric language sql stable set search_path = public as $$
  select h.value from conversion_factor_history h
  where h.key = p_key
    and h.valid_from <= p_when
    and (h.valid_to is null or h.valid_to > p_when)
  order by h.valid_from desc limit 1
$$;
grant execute on function f_rule_at(text, timestamptz) to authenticated;

create or replace view v_standard_history as
select h.key, c.label, h.value, h.unit, h.set_by,
       h.valid_from::date as in_force_from,
       h.valid_to::date   as in_force_until,
       (h.valid_to is null) as current,
       h.superseded_by,
       case when h.valid_to is null then 'In force now'
            else 'Applied from '||to_char(h.valid_from,'DD Mon YYYY')
                 ||' to '||to_char(h.valid_to,'DD Mon YYYY')
                 ||' — anything judged in that window used this value, not the current one.'
       end as standing
from conversion_factor_history h
left join conversion_factors c on c.key = h.key
order by h.key, h.valid_from desc;
grant select on v_standard_history to authenticated;

comment on function f_rule_at(text, timestamptz) is
  'The standard in force on a date. Judge the past against what was true then, never against what is true now.';;
