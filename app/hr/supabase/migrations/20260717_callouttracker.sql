-- 20260717_callouttracker.sql
-- Wire the Callout Tracker screen to REAL data.
--
-- Reads reuse the existing public.forensic_callouts(uuid[],date,date) RPC, which
-- assembles callouts from public.shift_exceptions (+ shifts/people/org_nodes/
-- time_off_requests/disciplinary_records). This migration adds the WRITE side that
-- was missing: log a callout, assign/clear coverage, and edit the note. All writes
-- land in public.shift_exceptions (the same table forensic_callouts reads), so the
-- tracker and the forensic report stay in sync. No new tables, no fake data.
--
-- Idempotent + SECURITY DEFINER (RLS on shift_exceptions blocks anon direct writes).

-- ── Log a callout / no-show ──────────────────────────────────────────────────
-- node_id is resolved from the person's active assignment, preferring one of the
-- caller's in-scope nodes. exception_type is 'no_show' or 'callout'.
create or replace function public.log_callout(
  p_person_id      uuid,
  p_exception_type text,
  p_callout_reason text default null,
  p_note           text default null,
  p_reported_by    uuid default null,
  p_node_ids       uuid[] default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_node_id  uuid;
  v_shift_id uuid;
  v_type     text;
  v_id       uuid;
begin
  if p_person_id is null then
    raise exception 'person is required';
  end if;

  v_type := case when lower(coalesce(p_exception_type,'')) in ('no_show','no call no show','ncns')
                 then 'no_show' else 'callout' end;

  -- Link the person's REAL shift for today when one exists (prefer in-scope
  -- nodes). forensic_callouts reads through shifts for date/slot, so linking
  -- keeps the logged callout dated and slotted in the report.
  select s.id, s.node_id into v_shift_id, v_node_id
  from shifts s
  where s.person_id = p_person_id
    and s.shift_date = current_date
    and (p_node_ids is null or s.node_id = any(p_node_ids))
  order by s.start_time nulls last
  limit 1;

  -- No shift today: fall back to the person's assignment node (in-scope first).
  if v_node_id is null then
    select a.node_id into v_node_id
    from assignments a
    where a.person_id = p_person_id
      and (p_node_ids is null or a.node_id = any(p_node_ids))
    order by a.effective_from desc nulls last
    limit 1;
  end if;

  if v_node_id is null then
    select a.node_id into v_node_id
    from assignments a
    where a.person_id = p_person_id
    order by a.effective_from desc nulls last
    limit 1;
  end if;

  if v_node_id is null then
    raise exception 'no location assignment found for this person';
  end if;

  insert into shift_exceptions (person_id, node_id, shift_id, exception_type, callout_reason, notes, reported_by, created_at)
  values (p_person_id, v_node_id, v_shift_id, v_type, p_callout_reason, p_note, p_reported_by, now())
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.log_callout(uuid,text,text,text,uuid,uuid[]) from public;
grant execute on function public.log_callout(uuid,text,text,text,uuid,uuid[]) to anon, authenticated;

-- ── Assign or clear coverage ─────────────────────────────────────────────────
-- Coverage == swap_person_id is not null (matches forensic_callouts). Passing a
-- null swap person clears coverage (marks the callout open again).
create or replace function public.set_callout_coverage(
  p_exception_id   uuid,
  p_swap_person_id uuid default null,
  p_note           text default null
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update shift_exceptions
     set swap_person_id = p_swap_person_id,
         notes = coalesce(nullif(p_note,''), notes)
   where id = p_exception_id;
  return found;
end $$;

revoke all on function public.set_callout_coverage(uuid,uuid,text) from public;
grant execute on function public.set_callout_coverage(uuid,uuid,text) to anon, authenticated;

-- ── Edit the free-text note on a callout ─────────────────────────────────────
create or replace function public.set_callout_note(
  p_exception_id uuid,
  p_note         text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update shift_exceptions
     set notes = p_note
   where id = p_exception_id;
  return found;
end $$;

revoke all on function public.set_callout_note(uuid,text) from public;
grant execute on function public.set_callout_note(uuid,text) to anon, authenticated;
