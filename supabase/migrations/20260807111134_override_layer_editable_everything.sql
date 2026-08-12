/* THE OVERRIDE LAYER — everything editable, nothing lost
   ------------------------------------------------------
   The owner's requirement: admins must be able to change anything - inventory,
   harvests, scheduling, costs, expectations. Nothing is set in stone.

   The trap: most of this data is SYNCED FROM METRC. Editing it in place means
   the next sync silently overwrites the correction. No error, no trace, and
   people stop trusting the edit screen within a week.

   So corrections live HERE, beside the synced row rather than on top of it.
   The sync writes what Metrc says; this records what we say; views show ours
   and can always show both. A sync can never destroy an override.

   Three rules built in, not written down:
     - Every override carries who, when, the old value, the new one and WHY.
       Reason is required. A number that judges people must be challengeable.
     - Overriding a Metrc-sourced field automatically raises a Metrc correction
       task, because the OS is a mirror - changing it here does not change the
       legal record.
     - Nothing is deleted. Withdrawing an override deactivates it and the
       history stays. */

create table if not exists tg_overrides (
  id            bigserial primary key,
  target_table  text    not null,
  row_key       text    not null,       -- the business key, not an internal id
  field_name    text    not null,
  old_value     text,                   -- what it was, captured at the time
  new_value     text,
  numeric_value numeric,                -- filled when the field is a number
  reason        text    not null,       -- REQUIRED. no silent edits.
  set_by        uuid    not null default auth.uid(),
  set_by_name   text,
  set_at        timestamptz not null default now(),
  active        boolean not null default true,
  withdrawn_at  timestamptz,
  withdrawn_by  uuid,
  metrc_sourced boolean not null default false,
  metrc_task_id uuid,                   -- the correction task this raised
  constraint reason_is_meaningful check (length(btrim(reason)) >= 10)
);
create unique index if not exists tg_over_one_active
  on tg_overrides (target_table, row_key, field_name) where active;
create index if not exists tg_over_lookup on tg_overrides (target_table, row_key) where active;

alter table tg_overrides enable row level security;

drop policy if exists tgo_read on tg_overrides;
create policy tgo_read on tg_overrides for select to authenticated using (true);

/* Who may change what. Owner and executive may edit anything. A department
   head may correct their own data but may NOT change a standard, because a
   standard re-judges the whole company. */
drop policy if exists tgo_write on tg_overrides;
create policy tgo_write on tg_overrides for all to authenticated
  using (exists (select 1 from app_users u where u.user_id = auth.uid()
                 and (u.role = any (array['owner'::app_role,'executive'::app_role])
                      or (u.role = 'dept_head'::app_role
                          and tg_overrides.target_table <> 'conversion_factors'))))
  with check (exists (select 1 from app_users u where u.user_id = auth.uid()
                 and (u.role = any (array['owner'::app_role,'executive'::app_role])
                      or (u.role = 'dept_head'::app_role
                          and tg_overrides.target_table <> 'conversion_factors'))));

grant select on tg_overrides to authenticated;
grant insert, update on tg_overrides to authenticated;
grant usage, select on sequence tg_overrides_id_seq to authenticated;

/* Reading an override: the value if one exists, otherwise what was passed in. */
create or replace function f_override(p_table text, p_key text, p_field text, p_fallback text default null)
returns text language sql stable set search_path = public as $$
  select coalesce((select o.new_value from tg_overrides o
                   where o.target_table=p_table and o.row_key=p_key
                     and o.field_name=p_field and o.active
                   order by o.set_at desc limit 1), p_fallback)
$$;

create or replace function f_override_num(p_table text, p_key text, p_field text, p_fallback numeric default null)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select o.numeric_value from tg_overrides o
                   where o.target_table=p_table and o.row_key=p_key
                     and o.field_name=p_field and o.active and o.numeric_value is not null
                   order by o.set_at desc limit 1), p_fallback)
$$;

grant execute on function f_override(text,text,text,text)      to authenticated;
grant execute on function f_override_num(text,text,text,numeric) to authenticated;

/* Overriding Metrc-sourced data raises a correction task automatically. The
   platform is a read-only mirror; changing it here does not change the record
   the state holds. */
create or replace function tg_override_raises_metrc_task()
returns trigger language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if new.metrc_sourced and new.active and new.metrc_task_id is null then
    insert into metrc_corrections
      (title, urgency, what_is_wrong, why_it_matters, how_to_fix_in_metrc,
       packages_affected, assigned_to, raised_by, first_seen)
    values (
      'OS override on '||new.target_table||' — '||new.field_name||' for '||new.row_key,
      'normal',
      'The OS now shows '||coalesce(new.new_value,'(blank)')||' for '||new.field_name
        ||' on '||new.row_key||'. Metrc still shows '||coalesce(new.old_value,'(blank)')||'. Reason given: '||new.reason,
      'Metrc is the legal record. Until it is corrected there, the state''s record and ours disagree, '
        ||'and any inspection reads Metrc.',
      'Locate '||new.row_key||' in Metrc and correct '||new.field_name||' to '||coalesce(new.new_value,'(blank)')
        ||'. If the record is finished or closed it must be reopened first. '
        ||'DO NOT clear this task until Metrc itself shows the corrected value.',
      new.row_key, 'Vincent', coalesce(new.set_by_name,'OS override'), current_date)
    returning id into tid;
    update tg_overrides set metrc_task_id = tid where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_override_metrc_task on tg_overrides;
create trigger trg_override_metrc_task
  after insert on tg_overrides
  for each row execute function tg_override_raises_metrc_task();

create or replace view v_overrides_active as
select o.id, o.target_table, o.row_key, o.field_name,
       o.old_value as metrc_says, o.new_value as we_say, o.reason,
       coalesce(o.set_by_name,'—') as set_by, o.set_at::date as set_on,
       o.metrc_sourced,
       case when o.metrc_task_id is null then 'not a Metrc field'
            when mc.fixed_in_metrc then 'fixed in Metrc'
            else 'AWAITING FIX IN METRC' end as metrc_status
from tg_overrides o
left join metrc_corrections mc on mc.id = o.metrc_task_id
where o.active order by o.set_at desc;
grant select on v_overrides_active to authenticated;

comment on table tg_overrides is
  'Every manual correction. Lives beside synced data so a sync can never overwrite it. Reason required. Metrc-sourced edits raise a correction task automatically.';;
