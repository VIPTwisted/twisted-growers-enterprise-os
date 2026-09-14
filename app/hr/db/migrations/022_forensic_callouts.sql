-- 022_forensic_callouts.sql
-- PLAN B: forensic callout report. ADDITIVE.
-- Adds 3 fields to shift_exceptions and one read RPC that assembles, per callout,
-- everything CHRO/attendance cases need: who/when/why, coverage, excused, PTO,
-- short-staffed, pattern count, and the linked disciplinary record.

alter table public.shift_exceptions
  add column if not exists excused boolean,
  add column if not exists callout_reason text,
  add column if not exists disciplinary_record_id uuid references public.disciplinary_records(id);

create or replace function public.forensic_callouts(
  p_node_ids uuid[], p_date_from date default null, p_date_to date default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v jsonb;
begin
  select coalesce(jsonb_agg(row order by sortdate desc nulls last), '[]'::jsonb) into v
  from (
    select coalesce(sh.shift_date, se.created_at::date) as sortdate,
      jsonb_build_object(
        'exception_id', se.id,
        'employee', coalesce(p.full_name,'Unknown'),
        'employee_id', se.person_id,
        'node', n.name,
        'exception_type', se.exception_type,
        'callout_date', coalesce(sh.shift_date, se.created_at::date),
        'reported_at', se.created_at,
        'shift_slot', case when sh.start_time is null then null
                           when extract(hour from sh.start_time) < 13 then 'AM' else 'PM' end,
        'reason', coalesce(se.callout_reason, se.notes),
        'reported_by', rb.full_name,
        'covered', (se.swap_person_id is not null),
        'covered_by', cov.full_name,
        'excused', se.excused,
        'pto_used', exists(select 1 from time_off_requests tor
                           where tor.person_id = se.person_id
                             and lower(tor.status) in ('approved','active')
                             and coalesce(sh.shift_date, se.created_at::date) between tor.start_date and tor.end_date),
        'short_staffed', (exists(select 1 from shift_zone_coverage zc
                                 where zc.node_id = se.node_id
                                   and zc.coverage_date = sh.shift_date and zc.is_short_staff_coverage)
                          or (se.swap_person_id is null and se.exception_type in ('callout','no_show'))),
        'pattern_count', (select count(*) from attendance_patterns ap
                          where ap.person_id = se.person_id and ap.resolved_at is null),
        'disciplinary_count', (select count(*) from disciplinary_records dr where dr.person_id = se.person_id),
        'disciplinary_record_id', se.disciplinary_record_id
      ) as row
    from shift_exceptions se
    left join shifts sh   on sh.id  = se.shift_id
    left join people p    on p.id   = se.person_id
    left join people cov  on cov.id = se.swap_person_id
    left join people rb   on rb.id  = se.reported_by
    left join org_nodes n on n.id   = se.node_id
    where se.node_id = any(p_node_ids)
      and (p_date_from is null or coalesce(sh.shift_date, se.created_at::date) >= p_date_from)
      and (p_date_to   is null or coalesce(sh.shift_date, se.created_at::date) <= p_date_to)
  ) t;
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(v), 'callouts', v);
end $$;

grant execute on function public.forensic_callouts(uuid[],date,date) to anon, authenticated;
