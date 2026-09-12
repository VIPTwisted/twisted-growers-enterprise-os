-- VIP Academy backend (HR brain, project zsmdejhgdyyaakqsjhmk).
-- Gamified learning hub (src/screens/Academy.jsx). Replaces the screen's
-- MOCK_EMPLOYEES / EMP_PROGRESS seeded generators and localStorage progress
-- store with real, per-person persistence.
--
-- Two tables + five SECURITY DEFINER RPCs. References only confirmed real
-- columns: org_nodes(id, name, tenant_id), people(id, full_name),
-- assignments(person_id, node_id, role_id, effective_from), roles(id, name).
-- Idempotent — safe to re-run. RLS on; access via definer RPCs only.
--
-- The academy_courses catalog is genuine curriculum CONFIG (the real VIP
-- Academy course set, matching the bundled lesson content in
-- src/screens/Academy.courses.js). It carries NO fabricated engagement metrics
-- — "enrolled" counts, ratings, completion %, XP and leaderboards are all
-- computed from real academy_progress rows, which start empty (honest zero).

create extension if not exists pgcrypto;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.academy_courses (
  id           text primary key,                                         -- stable slug
  tenant_id    uuid,
  node_id      uuid references public.org_nodes(id) on delete cascade,   -- null = org-wide
  title        text not null,
  category     text not null default 'General',
  level        text not null default 'Beginner',
  duration_min integer not null default 30,
  required     boolean not null default false,
  due_date     date,
  color        text not null default '#00e5ff',
  icon         text not null default '🎓',
  position     integer not null default 0,
  active       boolean not null default true,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.academy_progress (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid,
  course_id         text not null references public.academy_courses(id) on delete cascade,
  person_id         uuid not null,
  person_name       text not null default '',
  node_id           uuid,
  lessons_completed integer not null default 0,
  pct               integer not null default 0,
  certified         boolean not null default false,
  score             integer,
  enrolled_at       timestamptz not null default now(),
  completed_at      timestamptz,
  updated_at        timestamptz not null default now(),
  unique (course_id, person_id)
);

create index if not exists idx_academy_progress_course on public.academy_progress(course_id);
create index if not exists idx_academy_progress_person on public.academy_progress(person_id);
create index if not exists idx_academy_progress_node   on public.academy_progress(node_id);

alter table public.academy_courses  enable row level security;
alter table public.academy_progress enable row level security;

-- ── Seed the real curriculum (config; on-conflict-do-nothing keeps HR edits) ───
insert into public.academy_courses (id, title, category, level, duration_min, required, due_date, color, icon, position) values
  ('sales-excellence',          'The Art of Selling Pleasure',        'Sales Techniques',  'Intermediate', 42, true,  '2026-07-15', '#00e5ff', '💼', 1),
  ('product-knowledge',         'Product Knowledge Fundamentals',     'Product Knowledge', 'Beginner',     35, true,  '2026-07-01', '#a855f7', '🎁', 2),
  ('customer-service',          'Customer Service Mastery',           'Customer Service',  'Beginner',     38, true,  '2026-07-01', '#22c55e', '🤝', 3),
  ('ethics-professionalism',    'Team Ethics & Professionalism',      'Compliance',        'Beginner',     28, true,  '2026-06-30', '#f59e0b', '⚖️', 4),
  ('store-operations',          'Store Operations & Safety',          'Safety',            'Intermediate', 40, true,  '2026-07-15', '#ef4444', '🏪', 5),
  ('keyholder-responsibilities','Keyholder Responsibilities',         'Leadership',        'Advanced',     32, false, null,         '#f97316', '🔑', 6),
  ('loss-prevention',           'Loss Prevention Fundamentals',       'Loss Prevention',   'Beginner',     25, true,  '2026-07-10', '#6366f1', '🛡️', 7),
  ('lingerie-sizing',           'Lingerie Sizing & Fit Guide',        'Product Knowledge', 'Beginner',     20, false, null,         '#ec4899', '👗', 8),
  ('couples-products',          'Couples Product Recommendations',    'Product Knowledge', 'Intermediate', 30, false, null,         '#8b5cf6', '💑', 9),
  ('lubes-wellness',            'Lubricants & Wellness Deep Dive',    'Product Knowledge', 'Beginner',     22, false, null,         '#06b6d4', '💧', 10),
  ('upsell-addons',             'Upsell & Add-On Mastery',            'Sales Techniques',  'Intermediate', 18, false, null,         '#10b981', '➕', 11),
  ('opening-closing',           'Opening & Closing Procedures',       'Safety',            'Beginner',     15, true,  '2026-07-01', '#64748b', '🔐', 12),
  ('age-verification',          'Age Verification & CT Law',          'Compliance',        'Beginner',     12, true,  '2026-06-30', '#dc2626', '🪪', 13),
  ('de-escalation',             'De-Escalation Techniques',           'Customer Service',  'Intermediate', 28, false, null,         '#0ea5e9', '🕊️', 14),
  ('visual-merchandising',      'Visual Merchandising Basics',        'Leadership',        'Beginner',     35, false, null,         '#d946ef', '🎨', 15),
  ('pos-system',                'POS System & Cash Handling',         'Safety',            'Beginner',     45, true,  '2026-07-15', '#84cc16', '💳', 16),
  ('new-arrivals-q3',           'New Arrivals Q3 2026 Briefing',      'Product Knowledge', 'Beginner',     20, false, null,         '#f472b6', '✨', 17),
  ('harassment-prevention',     'Harassment Prevention & Reporting',  'Compliance',        'Beginner',     30, true,  '2026-06-30', '#fb923c', '🚫', 18),
  ('wellness-selfcare',         'Associate Wellness & Self-Care',     'Wellness',          'Beginner',     25, false, null,         '#34d399', '🌿', 19),
  ('leadership-fundamentals',   'Leadership Fundamentals',            'Leadership',        'Advanced',     50, false, null,         '#fbbf24', '👑', 20)
on conflict (id) do nothing;

-- ── Read: catalog (scoped) with this person's progress + real enrolled counts ──
create or replace function public.academy_courses_list(p_node_ids uuid[], p_person_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb; v_all boolean := (p_node_ids is null or array_length(p_node_ids, 1) is null);
begin
  select coalesce(jsonb_agg(x order by (x->>'position')::int, x->>'title'), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id',        c.id,
      'title',     c.title,
      'category',  c.category,
      'level',     c.level,
      'duration',  c.duration_min,
      'required',  c.required,
      'dueDate',   c.due_date,
      'color',     c.color,
      'icon',      c.icon,
      'position',  c.position,
      'enrolled',  (select count(*) from academy_progress ap where ap.course_id = c.id),
      'my',        coalesce((
        select jsonb_build_object(
          'lessonsCompleted', ap.lessons_completed,
          'pct',              ap.pct,
          'certified',        ap.certified,
          'score',            ap.score,
          'enrolledAt',       ap.enrolled_at)
        from academy_progress ap
        where ap.course_id = c.id and p_person_id is not null and ap.person_id = p_person_id
      ), null)
    ) as x
    from academy_courses c
    where c.active and (c.node_id is null or v_all or c.node_id = any(p_node_ids))
  ) q;
  return jsonb_build_object('ok', true, 'courses', v_rows);
end; $$;

-- ── Read: leaderboard, per-location breakdown, enrollments, KPIs (all real) ────
create or replace function public.academy_stats(p_node_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_all boolean := (p_node_ids is null or array_length(p_node_ids, 1) is null);
  v_leaderboard jsonb; v_locations jsonb; v_enrollments jsonb; v_kpis jsonb;
begin
  -- Leaderboard: only people with real progress.
  select coalesce(jsonb_agg(x order by (x->>'certs')::int desc, (x->>'xp')::int desc), '[]'::jsonb)
    into v_leaderboard
  from (
    select jsonb_build_object(
      'person_id', ap.person_id,
      'name',      coalesce(max(ap.person_name), max(pe.full_name), '—'),
      'location',  (select o.name from assignments a join org_nodes o on o.id = a.node_id
                    where a.person_id = ap.person_id order by a.effective_from desc nulls last limit 1),
      'role',      (select r.name from assignments a join roles r on r.id = a.role_id
                    where a.person_id = ap.person_id order by a.effective_from desc nulls last limit 1),
      'certs',     count(*) filter (where ap.certified),
      'xp',        coalesce(sum(ap.pct * 2 + case when ap.certified then 150 else 0 end), 0),
      'quizAvg',   coalesce(round(avg(ap.score) filter (where ap.score is not null))::int, 0)
    ) as x
    from academy_progress ap
    left join people pe on pe.id = ap.person_id
    where (v_all or ap.node_id = any(p_node_ids))
    group by ap.person_id
  ) q;

  -- Per-location breakdown across the in-scope location nodes.
  select coalesce(jsonb_agg(x order by x->>'loc'), '[]'::jsonb) into v_locations
  from (
    select jsonb_build_object(
      'node_id',   o.id,
      'loc',       o.name,
      'emps',      (select count(distinct a.person_id) from assignments a where a.node_id = o.id),
      'enrolled',  (select count(*) from academy_progress ap where ap.node_id = o.id),
      'completed', (select count(*) from academy_progress ap where ap.node_id = o.id and ap.certified),
      'overdue',   (select count(*) from academy_progress ap join academy_courses c on c.id = ap.course_id
                    where ap.node_id = o.id and c.required and c.due_date is not null
                      and c.due_date < current_date and not ap.certified),
      'compPct',   (select case when count(*) = 0 then 0
                      else round(count(*) filter (where ap.certified)::numeric / count(*) * 100) end
                    from academy_progress ap where ap.node_id = o.id)
    ) as x
    from org_nodes o
    where (v_all or o.id = any(p_node_ids))
  ) q;

  -- Raw enrollment rows for the HR report grid.
  select coalesce(jsonb_agg(jsonb_build_object(
      'person_id',  ap.person_id,
      'person_name',coalesce(nullif(ap.person_name, ''), pe.full_name, '—'),
      'node_id',    ap.node_id,
      'course_id',  ap.course_id,
      'pct',        ap.pct,
      'certified',  ap.certified,
      'score',      ap.score,
      'enrolled_at',ap.enrolled_at)), '[]'::jsonb)
    into v_enrollments
  from academy_progress ap
  left join people pe on pe.id = ap.person_id
  where (v_all or ap.node_id = any(p_node_ids));

  -- KPIs.
  select jsonb_build_object(
    'total_courses',   (select count(*) from academy_courses c where c.active and (c.node_id is null or v_all or c.node_id = any(p_node_ids))),
    'mandatory',       (select count(*) from academy_courses c where c.active and c.required and (c.node_id is null or v_all or c.node_id = any(p_node_ids))),
    'enrolled_month',  (select count(*) from academy_progress ap where (v_all or ap.node_id = any(p_node_ids)) and ap.enrolled_at >= date_trunc('month', now())),
    'completed_month', (select count(*) from academy_progress ap where (v_all or ap.node_id = any(p_node_ids)) and ap.certified and ap.completed_at >= date_trunc('month', now())),
    'certs_issued',    (select count(*) from academy_progress ap where (v_all or ap.node_id = any(p_node_ids)) and ap.certified),
    'new_this_month',  (select count(*) from academy_courses c where c.active and c.created_at >= date_trunc('month', now()) and (c.node_id is null or v_all or c.node_id = any(p_node_ids)))
  ) into v_kpis;

  return jsonb_build_object('ok', true, 'leaderboard', v_leaderboard,
    'locations', v_locations, 'enrollments', v_enrollments, 'kpis', v_kpis);
end; $$;

-- ── Write: upsert a person's progress on a course (idempotent) ─────────────────
create or replace function public.academy_log_progress(
  p_person_id uuid, p_course_id text, p_lessons_completed integer, p_pct integer,
  p_certified boolean, p_score integer default null,
  p_person_name text default '', p_node_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_node uuid := p_node_id;
begin
  if p_person_id is null or p_course_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_params');
  end if;
  if not exists (select 1 from academy_courses where id = p_course_id) then
    return jsonb_build_object('ok', false, 'error', 'unknown_course');
  end if;
  if v_node is not null then select tenant_id into v_tenant from org_nodes where id = v_node; end if;

  insert into academy_progress (tenant_id, course_id, person_id, person_name, node_id,
      lessons_completed, pct, certified, score, enrolled_at, completed_at, updated_at)
  values (v_tenant, p_course_id, p_person_id, coalesce(p_person_name, ''), v_node,
      greatest(coalesce(p_lessons_completed, 0), 0), least(greatest(coalesce(p_pct, 0), 0), 100),
      coalesce(p_certified, false), p_score, now(),
      case when coalesce(p_certified, false) then now() else null end, now())
  on conflict (course_id, person_id) do update set
    lessons_completed = greatest(academy_progress.lessons_completed, excluded.lessons_completed),
    pct               = greatest(academy_progress.pct, excluded.pct),
    certified         = academy_progress.certified or excluded.certified,
    score             = coalesce(excluded.score, academy_progress.score),
    person_name       = coalesce(nullif(excluded.person_name, ''), academy_progress.person_name),
    node_id           = coalesce(excluded.node_id, academy_progress.node_id),
    completed_at      = case when (academy_progress.certified or excluded.certified)
                             then coalesce(academy_progress.completed_at, now()) else null end,
    updated_at        = now();

  return jsonb_build_object('ok', true);
end; $$;

-- ── Write: HR create / edit a course ──────────────────────────────────────────
create or replace function public.academy_course_upsert(
  p_id text, p_title text, p_category text, p_level text, p_duration integer,
  p_required boolean, p_due_date date default null, p_color text default '#00e5ff',
  p_icon text default '🎓', p_node_id uuid default null, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id text; v_tenant uuid; v_pos int;
begin
  if p_title is null or length(btrim(p_title)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_title');
  end if;
  v_id := nullif(btrim(coalesce(p_id, '')), '');
  if v_id is null then
    v_id := regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g');
    v_id := btrim(v_id, '-');
    if v_id is null or v_id = '' then v_id := 'course'; end if;
    if exists (select 1 from academy_courses where id = v_id) then
      v_id := v_id || '-' || substr(gen_random_uuid()::text, 1, 6);
    end if;
  end if;
  if p_node_id is not null then select tenant_id into v_tenant from org_nodes where id = p_node_id; end if;
  select coalesce(max(position), 0) + 1 into v_pos from academy_courses;

  insert into academy_courses (id, tenant_id, node_id, title, category, level, duration_min,
      required, due_date, color, icon, position, created_by)
  values (v_id, v_tenant, p_node_id, btrim(p_title),
      coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'General'),
      coalesce(nullif(btrim(coalesce(p_level, '')), ''), 'Beginner'),
      coalesce(p_duration, 30), coalesce(p_required, false), p_due_date,
      coalesce(nullif(btrim(coalesce(p_color, '')), ''), '#00e5ff'),
      coalesce(nullif(btrim(coalesce(p_icon, '')), ''), '🎓'), v_pos, p_actor)
  on conflict (id) do update set
    title        = excluded.title,
    category     = excluded.category,
    level        = excluded.level,
    duration_min = excluded.duration_min,
    required     = excluded.required,
    due_date     = excluded.due_date,
    color        = excluded.color,
    icon         = excluded.icon,
    node_id      = coalesce(excluded.node_id, academy_courses.node_id),
    active       = true,
    updated_at   = now();

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- ── Write: HR remove a course (soft delete) ───────────────────────────────────
create or replace function public.academy_course_delete(p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update academy_courses set active = false, updated_at = now() where id = p_id;
  return jsonb_build_object('ok', found);
end; $$;

-- ── Grants (access via definer RPCs only) ─────────────────────────────────────
revoke all on function public.academy_courses_list(uuid[], uuid) from public;
revoke all on function public.academy_stats(uuid[]) from public;
revoke all on function public.academy_log_progress(uuid, text, integer, integer, boolean, integer, text, uuid) from public;
revoke all on function public.academy_course_upsert(text, text, text, text, integer, boolean, date, text, text, uuid, uuid) from public;
revoke all on function public.academy_course_delete(text) from public;

grant execute on function public.academy_courses_list(uuid[], uuid) to anon, authenticated;
grant execute on function public.academy_stats(uuid[]) to anon, authenticated;
grant execute on function public.academy_log_progress(uuid, text, integer, integer, boolean, integer, text, uuid) to anon, authenticated;
grant execute on function public.academy_course_upsert(text, text, text, text, integer, boolean, date, text, text, uuid, uuid) to anon, authenticated;
grant execute on function public.academy_course_delete(text) to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname like 'academy_%';
-- select count(*) from academy_courses;
