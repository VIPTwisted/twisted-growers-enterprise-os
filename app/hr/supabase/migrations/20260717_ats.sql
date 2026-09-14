-- ============================================================================
-- ATS screen backend (HR brain: zsmdejhgdyyaakqsjhmk)
-- ----------------------------------------------------------------------------
-- Finishes the recruiting pipeline. REUSES what already exists:
--   * applicant_records  (live table, 7 real rows; stages: applied/screening/
--                         interview/offer/hired — lowercase codes)
--   * job_postings       (live table)
--   * get_job_applications(p_node_ids)  (live RPC — redefined below so it also
--                         returns the new pipeline columns; same name+contract)
--   * org_nodes / people (location + interviewer identity)
--
-- ADDS what was verified missing on 2026-07-17 (anon probes, PGRST202):
--   * advance_application / create_job_posting  (the screen already called
--     these — they were PHANTOM; writes were silently lost)
--   * interviews (ats_interviews) + evaluation results
--   * background-check status on the applicant record
--   * an honest per-applicant event timeline (ats_applicant_events)
--
-- Idempotent. Security-definer RPCs, search_path pinned, granted anon+auth.
-- No seed data — real rows only.
-- ============================================================================

-- ── applicant_records: finish the columns the pipeline needs ────────────────
alter table public.applicant_records
  add column if not exists rating                integer,
  add column if not exists hired_date            date,
  add column if not exists rejection_reason      text,
  add column if not exists bg_check_status       text not null default 'not_requested',
  add column if not exists bg_check_requested_at timestamptz,
  add column if not exists bg_check_resolved_at  timestamptz;

-- ── job_postings: finish the fields the Post Job form captures ──────────────
alter table public.job_postings
  add column if not exists requirements    text,
  add column if not exists dept            text,
  add column if not exists employment_type text,
  add column if not exists hours_per_week  integer,
  add column if not exists openings        integer not null default 1,
  add column if not exists deadline        date,
  add column if not exists start_date      text,
  add column if not exists benefits        jsonb not null default '[]'::jsonb,
  add column if not exists post_to         text,
  add column if not exists updated_at      timestamptz not null default now();

alter table public.job_postings enable row level security;

-- ── interviews ──────────────────────────────────────────────────────────────
create table if not exists public.ats_interviews (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid,
  applicant_id     uuid not null references public.applicant_records(id) on delete cascade,
  node_id          uuid,
  interviewer_id   uuid references public.people(id),
  interviewer_name text,
  scheduled_date   date not null,
  scheduled_time   text,
  format           text not null default 'In-Person',   -- In-Person | Phone | Video
  status           text not null default 'scheduled',   -- scheduled | completed | canceled
  result           text,                                 -- Advance | Hold | Reject | Offer
  ratings          jsonb,                                -- { culture, experience, availability, presentation, sales } 1..5
  notes            text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists ats_interviews_node_idx      on public.ats_interviews (node_id);
create index if not exists ats_interviews_applicant_idx on public.ats_interviews (applicant_id);

alter table public.ats_interviews enable row level security;

-- ── applicant event timeline (honest history — no fabricated milestones) ───
create table if not exists public.ats_applicant_events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  applicant_id uuid not null references public.applicant_records(id) on delete cascade,
  node_id      uuid,
  event        text not null,
  note         text,
  actor        text,
  created_at   timestamptz not null default now()
);

create index if not exists ats_applicant_events_applicant_idx
  on public.ats_applicant_events (applicant_id, created_at);

alter table public.ats_applicant_events enable row level security;

-- ----------------------------------------------------------------------------
-- READ: applications in scope. Same name/contract as the live RPC, redefined
-- as setof applicant_records so the new pipeline columns flow through.
-- ----------------------------------------------------------------------------
drop function if exists public.get_job_applications(uuid[]);

create function public.get_job_applications(p_node_ids uuid[] default null)
returns setof public.applicant_records
language sql
security definer
set search_path = public
as $$
  select ar.*
  from public.applicant_records ar
  where (p_node_ids is null or array_length(p_node_ids, 1) is null or ar.node_id = any(p_node_ids))
  order by ar.applied_at desc nulls last, ar.full_name asc;
$$;

-- ----------------------------------------------------------------------------
-- READ: open positions in scope, with location name.
-- ----------------------------------------------------------------------------
create or replace function public.get_job_postings(p_node_ids uuid[] default null)
returns table (
  id              uuid,
  node_id         uuid,
  location        text,
  title           text,
  description     text,
  requirements    text,
  dept            text,
  employment_type text,
  hours_per_week  integer,
  openings        integer,
  pay_min         numeric,
  pay_max         numeric,
  deadline        date,
  start_date      text,
  benefits        jsonb,
  post_to         text,
  status          text,
  created_at      timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    jp.id,
    jp.node_id,
    onx.name::text            as location,
    jp.title::text,
    jp.description::text,
    jp.requirements::text,
    jp.dept::text,
    jp.employment_type::text,
    jp.hours_per_week::integer,
    jp.openings::integer,
    jp.pay_min::numeric,
    jp.pay_max::numeric,
    jp.deadline::date,
    jp.start_date::text,
    jp.benefits::jsonb,
    jp.post_to::text,
    jp.status::text,
    jp.created_at::timestamptz
  from public.job_postings jp
  left join public.org_nodes onx on onx.id = jp.node_id
  where (p_node_ids is null or array_length(p_node_ids, 1) is null or jp.node_id = any(p_node_ids))
  order by jp.created_at desc;
$$;

-- ----------------------------------------------------------------------------
-- WRITE: create a job posting (was phantom — the screen already called it).
-- ----------------------------------------------------------------------------
drop function if exists public.create_job_posting(uuid, text, text, numeric, numeric);

create or replace function public.create_job_posting(
  p_node_id         uuid,
  p_title           text,
  p_description     text    default null,
  p_pay_min         numeric default null,
  p_pay_max         numeric default null,
  p_requirements    text    default null,
  p_dept            text    default null,
  p_employment_type text    default null,
  p_hours           integer default null,
  p_openings        integer default 1,
  p_deadline        date    default null,
  p_start_date      text    default null,
  p_benefits        jsonb   default '[]'::jsonb,
  p_post_to         text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_node_id is null or coalesce(trim(p_title), '') = '' then
    raise exception 'node and title are required';
  end if;

  insert into public.job_postings
    (node_id, title, description, requirements, dept, employment_type,
     hours_per_week, openings, pay_min, pay_max, deadline, start_date,
     benefits, post_to, status)
  values
    (p_node_id, p_title, p_description, p_requirements, p_dept, p_employment_type,
     p_hours, greatest(coalesce(p_openings, 1), 1), p_pay_min, p_pay_max,
     p_deadline, p_start_date, coalesce(p_benefits, '[]'::jsonb), p_post_to, 'open')
  returning id into v_id;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- WRITE: move an application through the pipeline (was phantom).
-- Stages: applied → screening → interview → offer → hired, or rejected.
-- On 'rejected', p_notes carries the rejection reason.
-- ----------------------------------------------------------------------------
create or replace function public.advance_application(
  p_application_id uuid,
  p_stage          text,
  p_notes          text default null,
  p_actor          text default null
)
returns public.applicant_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.applicant_records;
begin
  if p_stage is null
     or p_stage not in ('applied','screening','interview','offer','hired','rejected') then
    raise exception 'invalid stage: %', p_stage;
  end if;

  update public.applicant_records
     set stage            = p_stage,
         hired_date       = case when p_stage = 'hired'
                                 then coalesce(hired_date, current_date)
                                 else hired_date end,
         rejection_reason = case when p_stage = 'rejected'
                                 then coalesce(nullif(trim(p_notes), ''), rejection_reason)
                                 else rejection_reason end,
         updated_at       = now()
   where id = p_application_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'application % not found', p_application_id;
  end if;

  insert into public.ats_applicant_events (tenant_id, applicant_id, node_id, event, note, actor)
  values (v_row.tenant_id, v_row.id, v_row.node_id,
          case when p_stage = 'rejected' then 'Rejected'
               when p_stage = 'hired'    then 'Hired'
               else 'Moved to ' || initcap(p_stage) end,
          nullif(trim(coalesce(p_notes, '')), ''),
          p_actor);

  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- WRITE: save/update the applicant's internal note.
-- ----------------------------------------------------------------------------
create or replace function public.update_applicant_notes(
  p_applicant_id uuid,
  p_notes        text
)
returns public.applicant_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.applicant_records;
begin
  update public.applicant_records
     set notes = p_notes, updated_at = now()
   where id = p_applicant_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'applicant % not found', p_applicant_id;
  end if;

  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- WRITE: background-check status (gate for interview → offer when the
-- bg_check_gate feature flag is on).
-- ----------------------------------------------------------------------------
create or replace function public.set_bg_check_status(
  p_applicant_id uuid,
  p_status       text,
  p_actor        text default null
)
returns public.applicant_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.applicant_records;
begin
  if p_status is null
     or p_status not in ('not_requested','pending','cleared','failed') then
    raise exception 'invalid background check status: %', p_status;
  end if;

  update public.applicant_records
     set bg_check_status       = p_status,
         bg_check_requested_at = case when p_status = 'pending'
                                      then now() else bg_check_requested_at end,
         bg_check_resolved_at  = case when p_status in ('cleared','failed')
                                      then now() else bg_check_resolved_at end,
         updated_at            = now()
   where id = p_applicant_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'applicant % not found', p_applicant_id;
  end if;

  insert into public.ats_applicant_events (tenant_id, applicant_id, node_id, event, note, actor)
  values (v_row.tenant_id, v_row.id, v_row.node_id,
          'Background check ' || replace(p_status, '_', ' '), null, p_actor);

  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- READ: interviews in scope, joined with applicant + location.
-- ----------------------------------------------------------------------------
create or replace function public.get_ats_interviews(p_node_ids uuid[] default null)
returns table (
  id               uuid,
  applicant_id     uuid,
  applicant_name   text,
  "position"       text,
  node_id          uuid,
  location         text,
  interviewer_id   uuid,
  interviewer_name text,
  scheduled_date   date,
  scheduled_time   text,
  format           text,
  status           text,
  result           text,
  ratings          jsonb,
  notes            text,
  created_at       timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    iv.id,
    iv.applicant_id,
    ar.full_name::text as applicant_name,
    ar.position::text  as "position",
    iv.node_id,
    onx.name::text     as location,
    iv.interviewer_id,
    iv.interviewer_name,
    iv.scheduled_date,
    iv.scheduled_time,
    iv.format,
    iv.status,
    iv.result,
    iv.ratings,
    iv.notes,
    iv.created_at
  from public.ats_interviews iv
  join public.applicant_records ar on ar.id = iv.applicant_id
  left join public.org_nodes onx on onx.id = iv.node_id
  where (p_node_ids is null or array_length(p_node_ids, 1) is null or iv.node_id = any(p_node_ids))
  order by iv.scheduled_date desc, iv.created_at desc;
$$;

-- ----------------------------------------------------------------------------
-- WRITE: schedule an interview (tenant/node derived from the applicant).
-- ----------------------------------------------------------------------------
create or replace function public.schedule_ats_interview(
  p_applicant_id     uuid,
  p_date             date,
  p_time             text default null,
  p_interviewer_id   uuid default null,
  p_interviewer_name text default null,
  p_format           text default 'In-Person',
  p_notes            text default null,
  p_created_by       text default null
)
returns public.ats_interviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_node   uuid;
  v_row    public.ats_interviews;
begin
  if p_applicant_id is null or p_date is null then
    raise exception 'applicant and date are required';
  end if;

  select tenant_id, node_id into v_tenant, v_node
  from public.applicant_records where id = p_applicant_id;

  if not found then
    raise exception 'applicant % not found', p_applicant_id;
  end if;

  insert into public.ats_interviews
    (tenant_id, applicant_id, node_id, interviewer_id, interviewer_name,
     scheduled_date, scheduled_time, format, notes, created_by)
  values
    (v_tenant, p_applicant_id, v_node, p_interviewer_id, p_interviewer_name,
     p_date, p_time, coalesce(p_format, 'In-Person'), p_notes, p_created_by)
  returning * into v_row;

  insert into public.ats_applicant_events (tenant_id, applicant_id, node_id, event, note, actor)
  values (v_tenant, p_applicant_id, v_node, 'Interview scheduled',
          concat_ws(' · ', to_char(p_date, 'Mon DD YYYY'), nullif(p_time, ''),
                    nullif(p_interviewer_name, '')),
          p_created_by);

  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- WRITE: post-interview evaluation. Marks the interview completed, stores the
-- category ratings, and rolls the average onto the applicant's star rating.
-- ----------------------------------------------------------------------------
create or replace function public.save_ats_interview_result(
  p_interview_id uuid,
  p_result       text,
  p_ratings      jsonb default null,
  p_notes        text  default null,
  p_actor        text  default null
)
returns public.ats_interviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ats_interviews;
  v_avg numeric;
begin
  update public.ats_interviews
     set status     = 'completed',
         result     = p_result,
         ratings    = coalesce(p_ratings, ratings),
         notes      = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
         updated_at = now()
   where id = p_interview_id
   returning * into v_row;

  if v_row.id is null then
    raise exception 'interview % not found', p_interview_id;
  end if;

  if p_ratings is not null then
    select avg(value::numeric) into v_avg
    from jsonb_each_text(p_ratings)
    where value ~ '^[0-9]+(\.[0-9]+)?$';

    if v_avg is not null then
      update public.applicant_records
         set rating = least(greatest(round(v_avg)::integer, 1), 5),
             updated_at = now()
       where id = v_row.applicant_id;
    end if;
  end if;

  insert into public.ats_applicant_events (tenant_id, applicant_id, node_id, event, note, actor)
  values (v_row.tenant_id, v_row.applicant_id, v_row.node_id,
          'Interview completed', 'Result: ' || coalesce(p_result, '—'), p_actor);

  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- READ: honest per-applicant timeline (only real recorded events).
-- ----------------------------------------------------------------------------
create or replace function public.get_ats_events(p_applicant_id uuid)
returns table (
  id         uuid,
  event      text,
  note       text,
  actor      text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.event, e.note, e.actor, e.created_at
  from public.ats_applicant_events e
  where e.applicant_id = p_applicant_id
  order by e.created_at asc;
$$;

-- ── grants ──────────────────────────────────────────────────────────────────
grant execute on function public.get_job_applications(uuid[])                          to anon, authenticated;
grant execute on function public.get_job_postings(uuid[])                              to anon, authenticated;
grant execute on function public.create_job_posting(uuid, text, text, numeric, numeric, text, text, text, integer, integer, date, text, jsonb, text) to anon, authenticated;
grant execute on function public.advance_application(uuid, text, text, text)           to anon, authenticated;
grant execute on function public.update_applicant_notes(uuid, text)                    to anon, authenticated;
grant execute on function public.set_bg_check_status(uuid, text, text)                 to anon, authenticated;
grant execute on function public.get_ats_interviews(uuid[])                            to anon, authenticated;
grant execute on function public.schedule_ats_interview(uuid, date, text, uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.save_ats_interview_result(uuid, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.get_ats_events(uuid)                                  to anon, authenticated;
