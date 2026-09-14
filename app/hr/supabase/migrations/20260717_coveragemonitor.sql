-- 20260717_coveragemonitor.sql
-- Coverage Monitor: replace the localStorage 'vip_local_callouts' pseudo-datastore
-- with REAL writes.
--
-- Reads were already real and are REUSED unchanged:
--   * get_week_schedule(uuid[],date,uuid)  — returns shift_id + the latest
--     shift_exceptions.exception_type per shift (so OUT status reads real).
--   * get_coverage_requests(uuid[])        — coverage-request overlay.
--   * forensic_callouts(uuid[],date,date)  — CalloutTracker / forensics.
--
-- What was missing (verified live 2026-07-17): a SHIFT-scoped callout write.
--   * log_callout (20260717_callouttracker.sql, pending apply) is person+TODAY only.
--   * report_callout exists live but is unreferenced in this repo and its
--     signature does not accept a shift id (probed via PostgREST).
-- The Coverage Monitor marks/clears a callout on a specific scheduled shift for
-- ANY viewed date, keyed by the shift_id that get_week_schedule already returns.
-- Writes land in public.shift_exceptions — the same table get_week_schedule,
-- forensic_callouts and the Callout Tracker read — so every surface stays in sync.
--
-- Idempotent. SECURITY DEFINER (RLS on shift_exceptions blocks anon direct writes).
-- No new tables. No seed/fake data.

-- ── Mark a scheduled shift called-out ────────────────────────────────────────
create or replace function public.mark_shift_callout(
  p_shift_id    uuid,
  p_reason      text default null,
  p_reported_by uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_person uuid;
  v_node   uuid;
  v_id     uuid;
begin
  if p_shift_id is null then
    raise exception 'shift is required';
  end if;

  select s.person_id, s.node_id into v_person, v_node
  from shifts s where s.id = p_shift_id;

  if v_person is null then
    raise exception 'shift not found';
  end if;

  -- Idempotent: if this shift already carries a callout/no-show, reuse it
  -- instead of stacking duplicates.
  select se.id into v_id
  from shift_exceptions se
  where se.shift_id = p_shift_id
    and se.exception_type in ('callout','no_show')
  order by se.created_at desc
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into shift_exceptions (person_id, node_id, shift_id, exception_type, callout_reason, reported_by, created_at)
  values (v_person, v_node, p_shift_id, 'callout', p_reason, p_reported_by, now())
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.mark_shift_callout(uuid,text,uuid) from public;
grant execute on function public.mark_shift_callout(uuid,text,uuid) to anon, authenticated;

-- ── Clear (undo) a mistaken callout on a shift ───────────────────────────────
-- Refuses to delete exceptions already linked to a disciplinary record, so the
-- forensic trail is preserved; those must be resolved through HR, not a toggle.
create or replace function public.clear_shift_callout(
  p_shift_id uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_shift_id is null then
    raise exception 'shift is required';
  end if;

  delete from shift_exceptions
   where shift_id = p_shift_id
     and exception_type in ('callout','no_show')
     and disciplinary_record_id is null;

  return found;
end $$;

revoke all on function public.clear_shift_callout(uuid) from public;
grant execute on function public.clear_shift_callout(uuid) to anon, authenticated;
