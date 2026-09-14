-- BP-12b-7: the late / early rules are measured against the PLAN date, not the last move — otherwise a pull
-- moved two days early could never be moved back to its plan day (that would read as "two days late").
-- plan_date is the planned date the calendar was built with; a reschedule never changes it.
set search_path = public;
alter table public.harvest_pulls add column if not exists plan_date date;
update public.harvest_pulls set plan_date = harvest_date where plan_date is null;
comment on column public.harvest_pulls.plan_date is 'The planned pull date the 8-week calendar was built with. f_harvest_reschedule measures late_tolerance_days / early_allowance_days against this, never against the previous move.';

create or replace function public.f_harvest_reschedule(p_id uuid, p_new_date date, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.current_app_role()::text; p public.harvest_pulls%rowtype; v_late int; v_early int; v_wk int; v_delta int; v_vs_plan int; v_warn jsonb := '[]'::jsonb;
        v_old jsonb; v_new jsonb; v_prev_room date; v_prev_fac date; v_next_room record; v_next_fac record; v_clash text; v_plan date;
begin
  if r is null or r not in ('owner', 'executive', 'admin', 'planner', 'dept_head', 'manager') then
    raise exception 'The % role may not move a harvest pull (owner, executive, admin, planner, department head or manager).', coalesce(r, 'signed-out') using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Write why the pull moves — ten characters at least. The reason stays with the calendar.'; end if;
  select * into p from public.harvest_pulls where id = p_id;
  if p.id is null then raise exception 'No pull with that id.'; end if;
  if p_new_date is null then raise exception 'A date is needed.'; end if;
  if p_new_date = p.harvest_date then raise exception 'Pull % is already on %.', p.pull_no, p.harvest_date; end if;
  if exists (select 1 from public.v_schedule_compliance x where x.event_type = 'Pull' and x.pull_no = p.pull_no and x.actual_date is not null) then
    raise exception 'Pull % was taken down on %; the plan date of a harvested pull is history, not a schedule.', p.pull_no, (select actual_date from public.v_schedule_compliance x where x.event_type = 'Pull' and x.pull_no = p.pull_no limit 1);
  end if;
  v_plan := coalesce(p.plan_date, p.harvest_date);
  select threshold into v_late from public.harvest_alert_rules where rule_key = 'late_tolerance_days' and active;
  select threshold into v_early from public.harvest_alert_rules where rule_key = 'early_allowance_days' and active;
  select threshold into v_wk from public.harvest_alert_rules where rule_key = 'weekend_warning_days' and active;
  v_delta := p_new_date - p.harvest_date; v_vs_plan := p_new_date - v_plan;
  -- RULE late_tolerance_days (owner hard rule, a row): never later than the PLAN allows
  if v_vs_plan > coalesce(v_late, 0) then
    raise exception 'Rule "%" refuses this: pull % would run % day(s) after its plan date % (allowance % day). %', coalesce((select label from public.harvest_alert_rules where rule_key = 'late_tolerance_days'), 'Late tolerance'), p.pull_no, v_vs_plan, v_plan, coalesce(v_late, 0),
      coalesce((select note from public.harvest_alert_rules where rule_key = 'late_tolerance_days'), '');
  end if;
  -- RULE early_allowance_days: earlier is preferred, within the allowance, measured from the plan
  if -v_vs_plan > coalesce(v_early, 0) then
    raise exception 'Rule "%" refuses this: pull % would run % day(s) before its plan date % (allowance % days). %', coalesce((select label from public.harvest_alert_rules where rule_key = 'early_allowance_days'), 'Early allowance'), p.pull_no, -v_vs_plan, v_plan, coalesce(v_early, 0),
      coalesce((select note from public.harvest_alert_rules where rule_key = 'early_allowance_days'), '');
  end if;
  -- warnings (the rules say plan for it, not refuse it)
  if extract(isodow from p_new_date) in (6, 7) then
    v_warn := v_warn || jsonb_build_object('rule', 'weekend_warning_days', 'text', 'The pull now lands on a ' || trim(to_char(p_new_date, 'Day')) || ' — plan a weekend crew or a second shift (rule: weekend landing, ' || coalesce(v_wk, 0) || ' days'' warning).');
  end if;
  if exists (select 1 from public.cult_cycle_policy c where c.room_key = p.flower_room and c.active and lower(coalesce(c.harvest_weekday, '')) <> '' and lower(trim(to_char(p_new_date, 'Day'))) <> lower(c.harvest_weekday)) then
    v_warn := v_warn || jsonb_build_object('rule', 'harvest_weekday', 'text', 'Room ' || p.flower_room || '''s policy weekday is ' || (select harvest_weekday from public.cult_cycle_policy c where c.room_key = p.flower_room) || '; the pull now lands on a ' || trim(to_char(p_new_date, 'Day')) || '.');
  end if;
  select string_agg('pull ' || q.pull_no || ' (' || q.flower_room || ')', ', ') into v_clash from public.harvest_pulls q where q.id <> p.id and q.harvest_date = p_new_date;
  if v_clash is not null then v_warn := v_warn || jsonb_build_object('rule', 'same_day', 'text', 'Another takedown is planned that day: ' || v_clash || '. Two takedowns in one day need two crews.'); end if;
  select max(harvest_date) into v_prev_room from public.harvest_pulls q where q.flower_room = p.flower_room and q.id <> p.id and q.harvest_date < p_new_date;
  select max(harvest_date) into v_prev_fac from public.harvest_pulls q where q.id <> p.id and q.harvest_date < p_new_date;
  v_old := to_jsonb(p);
  update public.harvest_pulls set
      harvest_date = p_new_date, day_of_week = trim(to_char(p_new_date, 'Day')), friday_flag = case when extract(isodow from p_new_date) = 5 then 'Friday' else null end,
      dry_start = p_new_date, dry_day_10 = p_new_date + 10, dry_day_14 = p_new_date + 14, day2_replant_date = p_new_date + 1,
      prev_same_room_harvest_date = v_prev_room, room_cycle_days = case when v_prev_room is null then room_cycle_days else p_new_date - v_prev_room end,
      prev_facility_harvest_date = v_prev_fac, facility_days_since_last_pull = case when v_prev_fac is null then null else p_new_date - v_prev_fac end,
      plan_date = v_plan
    where id = p.id returning to_jsonb(harvest_pulls) into v_new;
  select * into v_next_room from public.harvest_pulls q where q.flower_room = p.flower_room and q.id <> p.id and q.harvest_date > p_new_date order by q.harvest_date limit 1;
  if v_next_room.id is not null then update public.harvest_pulls set prev_same_room_harvest_date = p_new_date, room_cycle_days = harvest_date - p_new_date where id = v_next_room.id; end if;
  select * into v_next_fac from public.harvest_pulls q where q.id <> p.id and q.harvest_date > p_new_date order by q.harvest_date limit 1;
  if v_next_fac.id is not null then update public.harvest_pulls set prev_facility_harvest_date = p_new_date, facility_days_since_last_pull = harvest_date - p_new_date where id = v_next_fac.id; end if;
  insert into public.audit_events (actor, actor_name, entity, entity_id, action, old_value, new_value, reason)
  values (auth.uid(), public.f_actor(), 'harvest_pulls', p.id::text, 'harvest.reschedule', v_old, v_new, btrim(p_reason) || case when jsonb_array_length(v_warn) > 0 then ' · warnings: ' || (select string_agg(w->>'text', ' ') from jsonb_array_elements(v_warn) w) else '' end);
  return jsonb_build_object('ok', true, 'pull_no', p.pull_no, 'room', p.flower_room, 'from', p.harvest_date, 'to', p_new_date, 'plan_date', v_plan, 'delta_days', v_delta, 'vs_plan_days', v_vs_plan, 'warnings', v_warn,
    'next_room_pull', case when v_next_room.id is null then null else jsonb_build_object('pull_no', v_next_room.pull_no, 'date', v_next_room.harvest_date, 'room_cycle_days', v_next_room.harvest_date - p_new_date) end);
end $$;
notify pgrst, 'reload schema';;
