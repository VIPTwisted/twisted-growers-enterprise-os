-- BP-12g · the HR platform's scheduler screen drives the TG drafter end to end:
-- departments to draft for, the scheduling policy the drafter applies (rows from
-- public.scheduling_policy, shown instead of a list of "AI optimisation notes"), and the
-- post / discard steps under the caller's own OS role.
set search_path = hr, public, extensions;

create or replace function hr.tg_departments()
returns table(id uuid, name text, sort int)
language sql stable security definer set search_path = hr, public, extensions as $$
  select d.id, d.name, d.sort from public.departments d where coalesce(d.active, true) order by d.sort nulls last, d.name;
$$;
revoke all on function hr.tg_departments() from public, anon;
grant execute on function hr.tg_departments() to authenticated;

create or replace function hr.tg_scheduling_policy()
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  select jsonb_build_object(
    'facility_tz', p.facility_tz, 'signoff_roles', p.signoff_roles, 'draft_cadence', p.draft_cadence,
    'draft_horizon_days', p.draft_horizon_days, 'post_horizon_days', p.post_horizon_days,
    'min_rest_hours', p.min_rest_hours, 'max_consecutive_days', p.max_consecutive_days,
    'in_training_needs_partner', p.in_training_needs_partner, 'floater_rule', p.floater_rule,
    'primary_department_first', p.primary_department_first, 'avoid_overtime', p.avoid_overtime,
    'swap_needs_signoff', p.swap_needs_signoff, 'claim_with_ot_needs_signoff', p.claim_with_ot_needs_signoff,
    'callout_cover_order', p.callout_cover_order, 'weekend_zones', p.weekend_zones,
    'block_post_on_conflict', p.block_post_on_conflict,
    'default_shift_template', (select t.name || ' ' || to_char(t.start_time, 'HH24:MI') || '–' || to_char(t.end_time, 'HH24:MI') from public.shift_templates t where t.id = p.default_shift_template_id),
    'note', p.note, 'updated_at', p.updated_at,
    'caller_can_post', public.f_can_post_schedule())
  from public.scheduling_policy p limit 1;
$$;
revoke all on function hr.tg_scheduling_policy() from public, anon;
grant execute on function hr.tg_scheduling_policy() to authenticated;

create or replace function hr.tg_post_draft(p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
begin
  return public.f_post_schedule(p_draft_id);
end $$;
revoke all on function hr.tg_post_draft(uuid) from public, anon;
grant execute on function hr.tg_post_draft(uuid) to authenticated;

create or replace function hr.tg_discard_draft(p_draft_id uuid, p_why text default null)
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_status text;
begin
  if not public.f_can_post_schedule() then
    raise exception 'Only a scheduling sign-off role may discard a draft.' using errcode = '42501';
  end if;
  select status into v_status from public.schedule_drafts where id = p_draft_id;
  if v_status is null then return jsonb_build_object('ok', false, 'error', 'no such draft'); end if;
  if v_status = 'posted' then return jsonb_build_object('ok', false, 'error', 'a posted schedule is not discarded here — supersede it with a new draft'); end if;
  update public.schedule_drafts
     set status = 'discarded',
         rationale = coalesce(rationale, '') || ' | DISCARDED ' || to_char(now(), 'DD Mon YYYY HH24:MI') || ' from the HR platform' || coalesce(': ' || nullif(trim(p_why), ''), '')
   where id = p_draft_id;
  return jsonb_build_object('ok', true, 'draft_id', p_draft_id);
end $$;
revoke all on function hr.tg_discard_draft(uuid, text) from public, anon;
grant execute on function hr.tg_discard_draft(uuid, text) to authenticated;

notify pgrst, 'reload schema';;
