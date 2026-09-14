-- Shift Reports (end-of-shift 5W+H accountability) — real backend for
-- src/screens/ShiftReport.jsx. HR brain project: zsmdejhgdyyaakqsjhmk.
-- Idempotent: safe to run repeatedly. RLS enabled, no anon policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.

-- ── Table ────────────────────────────────────────────────────────────────────
-- One row per shift report. The composite form (staff present, events, ops
-- checklist, narrative fields) is stored in `data` jsonb exactly as the screen
-- shapes it; scalar columns are lifted out for scoping, filtering and sorting.

create table if not exists public.shift_reports (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid,
  node_id          uuid not null,
  report_date      date not null default current_date,
  shift_type       text,
  status           text not null default 'draft',
  manager_on_duty  text,
  rating           int,
  data             jsonb not null default '{}'::jsonb,
  author_name      text,
  author_id        uuid,
  submitted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists shift_reports_node_date_idx on public.shift_reports (node_id, report_date desc);
create index if not exists shift_reports_status_idx     on public.shift_reports (status);

alter table public.shift_reports enable row level security;

-- ── Read ─────────────────────────────────────────────────────────────────────
-- Every report visible to the caller's locations, newest first. Each element is
-- the stored `data` object overlaid with the authoritative server columns, so
-- the UI always trusts id/status/submittedAt/node from the row, not the blob.

create or replace function public.get_shift_reports(
  p_node_ids uuid[]
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    r.data
      || jsonb_build_object(
           'id',           r.id::text,
           'node_id',      r.node_id,
           'node_name',    n.name,
           'location',     coalesce(r.data->>'location', n.name),
           'date',         r.report_date,
           'shiftType',    coalesce(r.data->>'shiftType', r.shift_type),
           'status',       r.status,
           'managerOnDuty', r.manager_on_duty,
           'rating',       r.rating,
           'submittedAt',  r.submitted_at,
           'updatedAt',    r.updated_at
         )
    order by r.report_date desc, r.updated_at desc
  ), '[]'::jsonb)
  from public.shift_reports r
  left join public.org_nodes n on n.id = r.node_id
  where r.node_id = any(p_node_ids);
$$;

-- ── Write: upsert (draft or submit) ──────────────────────────────────────────
-- p_id null  -> insert a new report; p_id set -> update that report.
-- p_status 'submitted' stamps submitted_at the first time it is submitted.
-- Returns the saved report in the same shape get_shift_reports emits.

create or replace function public.shift_report_upsert(
  p_id        uuid,
  p_node_id   uuid,
  p_data      jsonb,
  p_status    text,
  p_author    text,
  p_author_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid;
  v_id      uuid;
  v_date    date;
  v_rating  int;
  v_manager text;
  v_status  text := coalesce(nullif(p_status, ''), 'draft');
begin
  if p_node_id is null then
    raise exception 'node_id (location) is required';
  end if;

  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;

  v_date    := coalesce(nullif(p_data->>'date','')::date, current_date);
  v_rating  := nullif(p_data->>'rating','')::int;
  v_manager := p_data->>'managerOnDuty';

  if p_id is null then
    insert into public.shift_reports
      (tenant_id, node_id, report_date, shift_type, status, manager_on_duty,
       rating, data, author_name, author_id,
       submitted_at)
    values
      (v_tenant, p_node_id, v_date, p_data->>'shiftType', v_status, v_manager,
       v_rating, coalesce(p_data,'{}'::jsonb), p_author, p_author_id,
       case when v_status = 'submitted' then now() else null end)
    returning id into v_id;
  else
    update public.shift_reports
       set node_id         = p_node_id,
           tenant_id       = coalesce(v_tenant, tenant_id),
           report_date     = v_date,
           shift_type      = p_data->>'shiftType',
           status          = v_status,
           manager_on_duty = v_manager,
           rating          = v_rating,
           data            = coalesce(p_data,'{}'::jsonb),
           author_name     = coalesce(p_author, author_name),
           author_id       = coalesce(p_author_id, author_id),
           submitted_at    = case when v_status = 'submitted'
                                  then coalesce(submitted_at, now())
                                  else submitted_at end,
           updated_at      = now()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'shift report % not found', p_id;
    end if;
  end if;

  return (
    select r.data
      || jsonb_build_object(
           'id', r.id::text, 'node_id', r.node_id, 'node_name', n.name,
           'location', coalesce(r.data->>'location', n.name),
           'date', r.report_date, 'shiftType', coalesce(r.data->>'shiftType', r.shift_type),
           'status', r.status, 'managerOnDuty', r.manager_on_duty,
           'rating', r.rating, 'submittedAt', r.submitted_at, 'updatedAt', r.updated_at
         )
    from public.shift_reports r
    left join public.org_nodes n on n.id = r.node_id
    where r.id = v_id
  );
end;
$$;

-- ── Write: delete ────────────────────────────────────────────────────────────

create or replace function public.shift_report_delete(
  p_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from public.shift_reports where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Grants (RPC-only access; table stays RLS-locked) ─────────────────────────

grant execute on function public.get_shift_reports(uuid[])                              to anon, authenticated;
grant execute on function public.shift_report_upsert(uuid, uuid, jsonb, text, text, uuid) to anon, authenticated;
grant execute on function public.shift_report_delete(uuid)                              to anon, authenticated;
