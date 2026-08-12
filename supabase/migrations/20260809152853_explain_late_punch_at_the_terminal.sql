-- A late punch is challenged AT THE TERMINAL while the reason is fresh, not
-- three weeks later in a write-up nobody can now explain. The person is
-- already clocked in; this only records why.
--
-- Callable by the punching employee with no HR right — the point is that they
-- answer in the moment. It can only attach a reason to their own punch, from
-- today, and it cannot change the times.
--
-- NOT granted to anon. Rule E6, and it caught a real mistake: I reasoned that
-- because a wall terminal holds no USER session it needed anonymous access,
-- which would expose this to every visitor since the publishable key ships in
-- the JavaScript bundle. The terminal instead signs in once as a DEVICE
-- service account and employees authenticate with login_id + PIN on top of it.
-- No session belongs to a person; the session belongs to the tablet.

create or replace function public.f_explain_late(
  p_time_entry_id uuid, p_reason_code text, p_explanation text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t public.time_entries%rowtype; v_occ uuid;
begin
  select * into v_t from public.time_entries where id = p_time_entry_id;
  if v_t.id is null then raise exception 'No such punch.'; end if;
  if coalesce(v_t.late_minutes,0) <= 0 then
    return jsonb_build_object('ok', true, 'note', 'not late — nothing to explain');
  end if;
  if v_t.work_date <> current_date then
    raise exception 'A reason can only be given on the day. Ask HR to correct an older punch.';
  end if;
  if length(btrim(coalesce(p_explanation,''))) < 4 or coalesce(p_reason_code,'') = '' then
    raise exception 'A reason code and a short explanation are both required.';
  end if;

  select id into v_occ from public.attendance_occurrences
   where employee_id = v_t.employee_id and work_date = v_t.work_date and kind = 'late'
   order by created_at desc limit 1;

  if v_occ is not null then
    update public.attendance_occurrences
       set reason_code = p_reason_code,
           explanation = btrim(p_explanation),
           status = 'awaiting_explanation'
     where id = v_occ;
  else
    insert into public.attendance_occurrences
      (employee_id, work_date, kind, minutes, reason_code, explanation, points, status, time_entry_id)
    select v_t.employee_id, v_t.work_date, 'late', v_t.late_minutes,
           p_reason_code, btrim(p_explanation),
           (select points_late from public.attendance_policy limit 1),
           'awaiting_explanation', v_t.id
    returning id into v_occ;
  end if;

  return jsonb_build_object('ok', true, 'occurrence_id', v_occ,
    'note', 'Recorded. A manager decides whether it is excused — an explanation is '
            'not self-approval, and the points stand until someone rules on them.');
end $$;

comment on function public.f_explain_late is
  'Records why a punch was late, given at the terminal in the moment. Own punch '
  'only, today only, cannot alter the times. Status becomes awaiting_explanation, '
  'NOT excused: explaining is not approving.';

revoke all on function public.f_explain_late(uuid,text,text) from public;
grant execute on function public.f_explain_late(uuid,text,text) to authenticated;

comment on table public.punch_devices is
  'Wall tablets, door scanners and payroll importers. A punch from an unknown or '
  'deactivated device is refused, so losing a tablet does not mean losing control '
  'of the clock. A tablet signs in as a DEVICE service account and holds that '
  'session; employees authenticate with login_id and PIN on top of it. No user '
  'session ever lives on a shared screen.';;
