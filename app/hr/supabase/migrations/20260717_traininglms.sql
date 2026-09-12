-- Training LMS backend (HR brain, project zsmdejhgdyyaakqsjhmk).
-- Full course-authoring LMS for src/screens/TrainingLMS.jsx. Replaces the
-- screen's seed()/buildEnrollments()/buildExpiryData() generators, the
-- hardcoded EMPLOYEES / LOCATIONS / INITIAL_COURSES / EFFECTIVENESS_MODULES
-- arrays and the localStorage training store with real persistence.
--
-- Data model (richer than academy_courses — this LMS authors nested
-- sections + lessons and tracks per-person enrollment progress, due dates
-- and quiz scores):
--   lms_courses      course catalog (config authored by HR)
--   lms_sections     ordered sections within a course
--   lms_lessons      ordered lessons within a section
--   lms_enrollments  one row per (course, person): pct / completed / due / score
--
-- References only confirmed-real columns: org_nodes(id, tenant_id),
-- people via get_roster (person ids). No fabricated engagement metrics —
-- every count / rate / score the screen shows is computed from real
-- lms_enrollments rows, which start empty (honest zero). The employee list
-- comes from the existing get_roster RPC, not a hardcoded array.
--
-- Idempotent — safe to re-run. RLS on; access via SECURITY DEFINER RPCs only.
-- No seed rows are inserted (HR authors the catalog through the UI).

create extension if not exists pgcrypto;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.lms_courses (
  id             text primary key,                                       -- stable slug
  tenant_id      uuid,
  node_id        uuid references public.org_nodes(id) on delete cascade, -- null = org-wide
  title          text not null,
  category       text not null default 'Compliance',
  description    text not null default '',
  level          text not null default 'Beginner',
  duration_hours numeric not null default 1,
  required       boolean not null default false,
  position       integer not null default 0,
  active         boolean not null default true,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.lms_sections (
  id         uuid primary key default gen_random_uuid(),
  course_id  text not null references public.lms_courses(id) on delete cascade,
  title      text not null default 'Section',
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lms_lessons (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.lms_sections(id) on delete cascade,
  title      text not null default 'Lesson',
  kind       text not null default 'Text',          -- Text | Video | Quiz
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lms_enrollments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  course_id    text not null references public.lms_courses(id) on delete cascade,
  person_id    uuid not null,
  person_name  text not null default '',
  node_id      uuid,
  pct          integer not null default 0,
  completed    boolean not null default false,
  due_date     date,
  score        integer,
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (course_id, person_id)
);

create index if not exists idx_lms_sections_course   on public.lms_sections(course_id);
create index if not exists idx_lms_lessons_section    on public.lms_lessons(section_id);
create index if not exists idx_lms_enroll_course      on public.lms_enrollments(course_id);
create index if not exists idx_lms_enroll_person      on public.lms_enrollments(person_id);
create index if not exists idx_lms_enroll_node        on public.lms_enrollments(node_id);

alter table public.lms_courses     enable row level security;
alter table public.lms_sections    enable row level security;
alter table public.lms_lessons     enable row level security;
alter table public.lms_enrollments enable row level security;

-- ── Read: scoped catalog (nested sections/lessons) + all enrollments ──────────
create or replace function public.lms_courses_list(p_node_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_all boolean := (p_node_ids is null or array_length(p_node_ids, 1) is null);
  v_courses jsonb; v_enroll jsonb;
begin
  select coalesce(jsonb_agg(x order by (x->>'position')::int, x->>'title'), '[]'::jsonb) into v_courses
  from (
    select jsonb_build_object(
      'id',            c.id,
      'title',         c.title,
      'category',      c.category,
      'description',   c.description,
      'level',         c.level,
      'durationHours', c.duration_hours,
      'required',      c.required,
      'position',      c.position,
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id',    s.id,
                 'title', s.title,
                 'order', s.position,
                 'lessons', coalesce((
                   select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'type', l.kind)
                          order by l.position, l.created_at)
                   from lms_lessons l where l.section_id = s.id
                 ), '[]'::jsonb))
               order by s.position, s.created_at)
        from lms_sections s where s.course_id = c.id
      ), '[]'::jsonb)
    ) as x
    from lms_courses c
    where c.active and (c.node_id is null or v_all or c.node_id = any(p_node_ids))
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
      'course_id',    e.course_id,
      'person_id',    e.person_id,
      'person_name',  e.person_name,
      'node_id',      e.node_id,
      'pct',          e.pct,
      'completed',    e.completed,
      'due_date',     e.due_date,
      'score',        e.score,
      'completed_at', e.completed_at)), '[]'::jsonb)
    into v_enroll
  from lms_enrollments e
  join lms_courses c on c.id = e.course_id and c.active
  where (v_all or e.node_id = any(p_node_ids));

  return jsonb_build_object('ok', true, 'courses', v_courses, 'enrollments', v_enroll);
end; $$;

-- ── Write: create / edit a course + replace its sections & lessons ─────────────
create or replace function public.lms_course_upsert(
  p_id text, p_title text, p_category text, p_description text, p_level text,
  p_duration_hours numeric, p_required boolean, p_sections jsonb,
  p_node_id uuid default null, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id text; v_tenant uuid; v_pos int;
  sec jsonb; les jsonb; v_sec_id uuid; sord int; lord int;
begin
  if p_title is null or length(btrim(p_title)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_title');
  end if;

  v_id := nullif(btrim(coalesce(p_id, '')), '');
  if v_id is null then
    v_id := btrim(regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g'), '-');
    if v_id is null or v_id = '' then v_id := 'course'; end if;
    if exists (select 1 from lms_courses where id = v_id) then
      v_id := v_id || '-' || substr(gen_random_uuid()::text, 1, 6);
    end if;
  end if;

  if p_node_id is not null then select tenant_id into v_tenant from org_nodes where id = p_node_id; end if;
  select coalesce(max(position), 0) + 1 into v_pos from lms_courses;

  insert into lms_courses (id, tenant_id, node_id, title, category, description, level,
      duration_hours, required, position, created_by)
  values (v_id, v_tenant, p_node_id, btrim(p_title),
      coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Compliance'),
      coalesce(p_description, ''),
      coalesce(nullif(btrim(coalesce(p_level, '')), ''), 'Beginner'),
      coalesce(p_duration_hours, 1), coalesce(p_required, false), v_pos, p_actor)
  on conflict (id) do update set
    title          = excluded.title,
    category       = excluded.category,
    description    = excluded.description,
    level          = excluded.level,
    duration_hours = excluded.duration_hours,
    required       = excluded.required,
    node_id        = coalesce(excluded.node_id, lms_courses.node_id),
    active         = true,
    updated_at     = now();

  -- Replace the full section/lesson tree when provided (null = leave as-is).
  if p_sections is not null and jsonb_typeof(p_sections) = 'array' then
    delete from lms_sections where course_id = v_id;   -- cascades to lessons
    sord := 0;
    for sec in select value from jsonb_array_elements(p_sections) loop
      sord := sord + 1;
      insert into lms_sections (course_id, title, position)
      values (v_id, coalesce(nullif(btrim(coalesce(sec->>'title', '')), ''), 'Section'),
              coalesce((sec->>'position')::int, sord))
      returning id into v_sec_id;
      if (sec->'lessons') is not null and jsonb_typeof(sec->'lessons') = 'array' then
        lord := 0;
        for les in select value from jsonb_array_elements(sec->'lessons') loop
          lord := lord + 1;
          insert into lms_lessons (section_id, title, kind, position)
          values (v_sec_id, coalesce(nullif(btrim(coalesce(les->>'title', '')), ''), 'Lesson'),
                  coalesce(nullif(btrim(coalesce(les->>'kind', '')), ''), 'Text'),
                  coalesce((les->>'position')::int, lord));
        end loop;
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- ── Write: remove a course (soft delete) ──────────────────────────────────────
create or replace function public.lms_course_delete(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update lms_courses set active = false, updated_at = now() where id = p_id;
  return jsonb_build_object('ok', found);
end; $$;

-- ── Write: enroll one person (idempotent) ─────────────────────────────────────
create or replace function public.lms_enroll(
  p_course_id text, p_person_id uuid, p_person_name text default '',
  p_node_id uuid default null, p_due_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if p_course_id is null or p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_params');
  end if;
  if not exists (select 1 from lms_courses where id = p_course_id and active) then
    return jsonb_build_object('ok', false, 'error', 'unknown_course');
  end if;
  if p_node_id is not null then select tenant_id into v_tenant from org_nodes where id = p_node_id; end if;

  insert into lms_enrollments (tenant_id, course_id, person_id, person_name, node_id, pct, completed, due_date)
  values (v_tenant, p_course_id, p_person_id, coalesce(p_person_name, ''), p_node_id, 0, false, p_due_date)
  on conflict (course_id, person_id) do update set
    node_id     = coalesce(excluded.node_id, lms_enrollments.node_id),
    due_date    = coalesce(excluded.due_date, lms_enrollments.due_date),
    person_name = coalesce(nullif(excluded.person_name, ''), lms_enrollments.person_name),
    updated_at  = now();

  return jsonb_build_object('ok', true);
end; $$;

-- ── Write: bulk enroll (by role / by location) ────────────────────────────────
-- p_persons = [{ "person_id": uuid, "person_name": text, "node_id": uuid }, ...]
create or replace function public.lms_bulk_enroll(
  p_course_id text, p_persons jsonb, p_due_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rec jsonb; v_tenant uuid; v_node uuid; v_pid uuid; v_count int := 0;
begin
  if p_course_id is null or not exists (select 1 from lms_courses where id = p_course_id and active) then
    return jsonb_build_object('ok', false, 'error', 'unknown_course');
  end if;
  if p_persons is null or jsonb_typeof(p_persons) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'no_persons');
  end if;

  for rec in select value from jsonb_array_elements(p_persons) loop
    v_pid := nullif(rec->>'person_id', '')::uuid;
    if v_pid is null then continue; end if;
    v_node := nullif(rec->>'node_id', '')::uuid;
    v_tenant := null;
    if v_node is not null then select tenant_id into v_tenant from org_nodes where id = v_node; end if;
    insert into lms_enrollments (tenant_id, course_id, person_id, person_name, node_id, pct, completed, due_date)
    values (v_tenant, p_course_id, v_pid, coalesce(rec->>'person_name', ''), v_node, 0, false, p_due_date)
    on conflict (course_id, person_id) do nothing;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'processed', v_count);
end; $$;

-- ── Write: un-enroll ──────────────────────────────────────────────────────────
create or replace function public.lms_unenroll(p_course_id text, p_person_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from lms_enrollments where course_id = p_course_id and person_id = p_person_id;
  return jsonb_build_object('ok', true);
end; $$;

-- ── Write: mark complete (upsert; completion, optional real quiz score) ───────
create or replace function public.lms_mark_complete(
  p_course_id text, p_person_id uuid, p_score integer default null,
  p_person_name text default '', p_node_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if p_course_id is null or p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_params');
  end if;
  if not exists (select 1 from lms_courses where id = p_course_id and active) then
    return jsonb_build_object('ok', false, 'error', 'unknown_course');
  end if;
  if p_node_id is not null then select tenant_id into v_tenant from org_nodes where id = p_node_id; end if;

  insert into lms_enrollments (tenant_id, course_id, person_id, person_name, node_id,
      pct, completed, score, completed_at)
  values (v_tenant, p_course_id, p_person_id, coalesce(p_person_name, ''), p_node_id,
      100, true, p_score, now())
  on conflict (course_id, person_id) do update set
    pct          = 100,
    completed    = true,
    score        = coalesce(excluded.score, lms_enrollments.score),
    person_name  = coalesce(nullif(excluded.person_name, ''), lms_enrollments.person_name),
    node_id      = coalesce(excluded.node_id, lms_enrollments.node_id),
    completed_at = coalesce(lms_enrollments.completed_at, now()),
    updated_at   = now();

  return jsonb_build_object('ok', true);
end; $$;

-- ── Write: set / change an enrollment's due date ──────────────────────────────
create or replace function public.lms_set_due(
  p_course_id text, p_person_id uuid, p_due_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update lms_enrollments set due_date = p_due_date, updated_at = now()
  where course_id = p_course_id and person_id = p_person_id;
  return jsonb_build_object('ok', found);
end; $$;

-- ── Grants (access via definer RPCs only) ─────────────────────────────────────
revoke all on function public.lms_courses_list(uuid[]) from public;
revoke all on function public.lms_course_upsert(text, text, text, text, text, numeric, boolean, jsonb, uuid, uuid) from public;
revoke all on function public.lms_course_delete(text) from public;
revoke all on function public.lms_enroll(text, uuid, text, uuid, date) from public;
revoke all on function public.lms_bulk_enroll(text, jsonb, date) from public;
revoke all on function public.lms_unenroll(text, uuid) from public;
revoke all on function public.lms_mark_complete(text, uuid, integer, text, uuid) from public;
revoke all on function public.lms_set_due(text, uuid, date) from public;

grant execute on function public.lms_courses_list(uuid[]) to anon, authenticated;
grant execute on function public.lms_course_upsert(text, text, text, text, text, numeric, boolean, jsonb, uuid, uuid) to anon, authenticated;
grant execute on function public.lms_course_delete(text) to anon, authenticated;
grant execute on function public.lms_enroll(text, uuid, text, uuid, date) to anon, authenticated;
grant execute on function public.lms_bulk_enroll(text, jsonb, date) to anon, authenticated;
grant execute on function public.lms_unenroll(text, uuid) to anon, authenticated;
grant execute on function public.lms_mark_complete(text, uuid, integer, text, uuid) to anon, authenticated;
grant execute on function public.lms_set_due(text, uuid, date) to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname like 'lms_%';
-- select count(*) from lms_courses;
