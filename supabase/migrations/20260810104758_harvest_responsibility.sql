-- Owner, 10 Aug 2026: "we have cultivation team that we will assign responsibilities and
-- tasks to."
--
-- Metrc records NO person on a harvest - not in the API, not in the Harvests-Inactive export.
-- So the OS carries it. This is the accountability layer that Metrc cannot provide, and it is
-- the difference between "this harvest is short" and "this harvest is short and here is who
-- was responsible for it".
--
-- TWO ROOMS, TWO PEOPLE. The flower room (F1-F4) lives in the harvest NAME and belongs to the
-- grower. The drying room (Dry Room #1, Cure Vault, Freezer/Biomass...) is a separate field
-- and belongs to whoever ran the dry. A harvest short on yield with normal water is the
-- GROWER's; one with impossible water loss is the DRY ROOM's or the scale's. Assigning both
-- is what makes the audit verdicts actionable instead of accusatory.

create table if not exists harvest_responsibility (
  id             uuid primary key default gen_random_uuid(),
  stage          text not null check (stage in ('grow','dry','trim','package')),
  scope          text not null check (scope in ('room_period','harvest')),

  flower_room    text,      -- F1..F4, read from the harvest name. grow stage.
  drying_room    text,      -- the drying location. dry stage.
  harvest_name   text,      -- a specific harvest, overriding any room rule

  effective_from date,
  effective_to   date,      -- null = still current

  employee_id    uuid not null references employees(id),
  assigned_by    text not null,
  assigned_at    timestamptz not null default now(),
  note           text,

  -- a room rule needs a room and a start; a harvest rule needs the harvest
  constraint scope_is_complete check (
    (scope = 'room_period' and coalesce(flower_room, drying_room) is not null
                           and effective_from is not null)
    or (scope = 'harvest' and harvest_name is not null)
  ),
  constraint dates_run_forwards check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  )
);
alter table harvest_responsibility enable row level security;
create index if not exists hr_grow_idx on harvest_responsibility (stage, flower_room, effective_from);
create index if not exists hr_dry_idx  on harvest_responsibility (stage, drying_room, effective_from);
create index if not exists hr_harv_idx on harvest_responsibility (stage, harvest_name);

create policy hresp_read  on harvest_responsibility for select to authenticated using (true);
create policy hresp_write on harvest_responsibility for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table harvest_responsibility is
  'Who was responsible for a harvest, by stage. Metrc records no person on a harvest, so this '
  'is the only place accountability can live. Assign by ROOM AND PERIOD and it rolls forward '
  'automatically onto every future harvest from that room; assign by harvest to override.';

-- Resolve the accountable person. A specific harvest rule beats a room rule; the most
-- recently-started room rule wins among overlapping ones.
create or replace function f_harvest_accountable(
  p_harvest text, p_flower_room text, p_drying_room text, p_finished date, p_stage text)
returns table(employee_id uuid, full_name text, basis text)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select e.id, e.full_name,
         case when r.scope = 'harvest' then 'assigned to this harvest directly'
              else 'assigned to ' || coalesce(r.flower_room, r.drying_room)
                   || ' from ' || r.effective_from
                   || coalesce(' to ' || r.effective_to, ' (still current)') end
  from harvest_responsibility r
  join employees e on e.id = r.employee_id
  where r.stage = p_stage
    and (
      (r.scope = 'harvest' and r.harvest_name = p_harvest)
      or (r.scope = 'room_period'
          and ( (p_stage = 'grow' and r.flower_room  is not distinct from p_flower_room)
             or (p_stage <> 'grow' and r.drying_room is not distinct from p_drying_room) )
          and (p_finished is null or r.effective_from <= p_finished)
          and (r.effective_to is null or p_finished is null or r.effective_to >= p_finished))
    )
  order by (r.scope = 'harvest') desc, r.effective_from desc nulls last
  limit 1;
$$;

comment on function f_harvest_accountable(text,text,text,date,text) is
  'Who was accountable for a harvest at a given stage. A harvest-specific assignment beats a '
  'room-period one; among overlapping room rules the most recently started wins. Returns no '
  'row when nobody was assigned - the caller must say "nobody assigned", never guess a name.';;
