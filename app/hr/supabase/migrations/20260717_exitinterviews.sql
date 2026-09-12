-- Exit Interviews — real backend for src/screens/ExitInterviews.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.
--
-- The "pending" queue is DERIVED from public.hr_separations (the same table the
-- Rehire Management screen writes): every separation that does not yet have a
-- COMPLETED or WAIVED exit interview is awaiting one. Completed interviews and
-- their scheduling/waive state live in the new hr_exit_interviews table, one row
-- per separation. tenant_id is resolved from org_nodes (same convention as the
-- rehires / cleaning_logs backends).

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.hr_exit_interviews (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid,
  separation_id       uuid references public.hr_separations(id) on delete cascade,
  node_id             uuid,
  person_id           uuid,
  employee_name       text not null,
  exit_date           date,
  -- 'SCHEDULED' | 'COMPLETED' | 'WAIVED'
  status              text not null default 'SCHEDULED',
  interviewed_by      text,
  interviewer_id      uuid,
  would_rehire        boolean,
  primary_reason      text,
  overall_experience  int,
  management_rating   int,
  recommend_employer  text,
  what_could_do_better text,
  suggestions         text,
  confidential_notes  text,
  completed_at        timestamptz,
  created_by          uuid,
  created_at          timestamptz not null default now()
);

-- Plain unique index (Postgres treats NULLs as distinct, so ON CONFLICT
-- (separation_id) inference works and null separation_ids are still allowed).
create unique index if not exists hr_exit_interviews_sep_uidx
  on public.hr_exit_interviews (separation_id);
create index if not exists hr_exit_interviews_node_idx   on public.hr_exit_interviews (node_id);
create index if not exists hr_exit_interviews_status_idx  on public.hr_exit_interviews (status);

alter table public.hr_exit_interviews enable row level security;

-- ── Reads ────────────────────────────────────────────────────────────────────

-- Separations still awaiting an exit interview, scoped to the caller's nodes.
create or replace function public.exit_interview_pending_list(
  p_node_ids uuid[] default null
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'separation_id',       s.id,
    'employee',            s.employee_name,
    'node_id',             s.node_id,
    'location',            coalesce(n.name, '—'),
    'lastDay',             s.sep_date,
    'manager',             coalesce(s.former_manager, '—'),
    'daysSinceSeparation', case when s.sep_date is null then 0
                                else greatest(0, (current_date - s.sep_date)) end,
    'status',              case
                             when ei.status = 'SCHEDULED' then 'SCHEDULED'
                             when s.sep_date is not null and (current_date - s.sep_date) >= 7 then 'OVERDUE'
                             else 'PENDING' end
  ) order by s.sep_date asc nulls last), '[]'::jsonb)
  from public.hr_separations s
  left join public.org_nodes n on n.id = s.node_id
  left join public.hr_exit_interviews ei on ei.separation_id = s.id
  where (p_node_ids is null or s.node_id = any(p_node_ids) or s.node_id is null)
    and coalesce(ei.status, '') not in ('COMPLETED', 'WAIVED');
$$;

-- Completed exit interviews, scoped to the caller's nodes.
create or replace function public.exit_interview_completed_list(
  p_node_ids uuid[] default null
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',                ei.id,
    'separation_id',     ei.separation_id,
    'node_id',           ei.node_id,
    'employee',          ei.employee_name,
    'location',          coalesce(n.name, '—'),
    'exitDate',          ei.exit_date,
    'interviewedBy',     coalesce(ei.interviewed_by, '—'),
    'wouldRehire',       coalesce(ei.would_rehire, false),
    'primaryReason',     coalesce(ei.primary_reason, '—'),
    'score',             coalesce(ei.overall_experience, 0),
    'dateCompleted',     ei.completed_at,
    'overallExp',        coalesce(ei.overall_experience, 0),
    'mgmtRating',        coalesce(ei.management_rating, 0),
    'recommendEmployer', coalesce(ei.recommend_employer, '—'),
    'whatCouldDoBetter', coalesce(ei.what_could_do_better, ''),
    'suggestions',       coalesce(ei.suggestions, ''),
    'confidentialNotes', coalesce(ei.confidential_notes, '')
  ) order by ei.completed_at desc nulls last), '[]'::jsonb)
  from public.hr_exit_interviews ei
  left join public.org_nodes n on n.id = ei.node_id
  where ei.status = 'COMPLETED'
    and (p_node_ids is null or ei.node_id = any(p_node_ids) or ei.node_id is null);
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

-- Mark a pending separation's exit interview as SCHEDULED.
create or replace function public.exit_interview_schedule(
  p_separation_id uuid,
  p_actor         uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.hr_separations%rowtype;
begin
  select * into s from public.hr_separations where id = p_separation_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  insert into public.hr_exit_interviews
    (tenant_id, separation_id, node_id, person_id, employee_name, exit_date, status, created_by)
  values
    (s.tenant_id, s.id, s.node_id, s.person_id, s.employee_name, s.sep_date, 'SCHEDULED', p_actor)
  on conflict (separation_id) do update
    set status     = case when public.hr_exit_interviews.status = 'COMPLETED'
                          then public.hr_exit_interviews.status else 'SCHEDULED' end,
        created_by = coalesce(public.hr_exit_interviews.created_by, excluded.created_by);
  return jsonb_build_object('ok', true);
end;
$$;

-- Waive the exit interview for a separation.
create or replace function public.exit_interview_waive(
  p_separation_id uuid,
  p_actor         uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.hr_separations%rowtype;
begin
  select * into s from public.hr_separations where id = p_separation_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  insert into public.hr_exit_interviews
    (tenant_id, separation_id, node_id, person_id, employee_name, exit_date, status, created_by)
  values
    (s.tenant_id, s.id, s.node_id, s.person_id, s.employee_name, s.sep_date, 'WAIVED', p_actor)
  on conflict (separation_id) do update
    set status = 'WAIVED', created_by = coalesce(public.hr_exit_interviews.created_by, excluded.created_by);
  return jsonb_build_object('ok', true);
end;
$$;

-- Record a completed exit interview for a separation.
create or replace function public.exit_interview_complete(
  p_separation_id uuid,
  p_would_rehire  boolean,
  p_primary_reason text,
  p_overall       int,
  p_mgmt          int,
  p_recommend     text,
  p_better        text,
  p_suggestions   text,
  p_notes         text,
  p_interviewed_by text default null,
  p_actor         uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.hr_separations%rowtype; v_id uuid;
begin
  select * into s from public.hr_separations where id = p_separation_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  insert into public.hr_exit_interviews
    (tenant_id, separation_id, node_id, person_id, employee_name, exit_date, status,
     interviewed_by, interviewer_id, would_rehire, primary_reason, overall_experience,
     management_rating, recommend_employer, what_could_do_better, suggestions,
     confidential_notes, completed_at, created_by)
  values
    (s.tenant_id, s.id, s.node_id, s.person_id, s.employee_name, s.sep_date, 'COMPLETED',
     nullif(btrim(coalesce(p_interviewed_by, '')), ''), p_actor, p_would_rehire,
     nullif(btrim(coalesce(p_primary_reason, '')), ''), p_overall,
     p_mgmt, nullif(btrim(coalesce(p_recommend, '')), ''),
     nullif(btrim(coalesce(p_better, '')), ''), nullif(btrim(coalesce(p_suggestions, '')), ''),
     nullif(btrim(coalesce(p_notes, '')), ''), now(), p_actor)
  on conflict (separation_id) do update
    set status              = 'COMPLETED',
        interviewed_by      = excluded.interviewed_by,
        interviewer_id      = excluded.interviewer_id,
        would_rehire        = excluded.would_rehire,
        primary_reason      = excluded.primary_reason,
        overall_experience  = excluded.overall_experience,
        management_rating   = excluded.management_rating,
        recommend_employer  = excluded.recommend_employer,
        what_could_do_better = excluded.what_could_do_better,
        suggestions         = excluded.suggestions,
        confidential_notes  = excluded.confidential_notes,
        completed_at        = now()
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── Grants (RPC-only access; table stays RLS-locked) ─────────────────────────

grant execute on function public.exit_interview_pending_list(uuid[])            to anon, authenticated;
grant execute on function public.exit_interview_completed_list(uuid[])          to anon, authenticated;
grant execute on function public.exit_interview_schedule(uuid, uuid)            to anon, authenticated;
grant execute on function public.exit_interview_waive(uuid, uuid)               to anon, authenticated;
grant execute on function public.exit_interview_complete(uuid, boolean, text, int, int, text, text, text, text, text, uuid) to anon, authenticated;
