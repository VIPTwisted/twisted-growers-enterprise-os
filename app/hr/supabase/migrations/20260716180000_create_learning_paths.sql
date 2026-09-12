-- Learning Paths backend (HR brain, project zsmdejhgdyyaakqsjhmk).
-- Sequenced, role-based learning journeys (Microsoft Viva Learning analog):
-- a path is an ordered set of steps; HR builds/assigns paths, employees walk
-- them, each step is marked complete. Replaces the old localStorage store in
-- src/screens/LearningPaths.jsx with real persistence.
--
-- Self-contained: 3 new tables + 4 SECURITY DEFINER RPCs. References only
-- confirmed real columns (org_nodes.id / tenant_id). Idempotent — safe to
-- re-run. RLS on; no anon policies (access is via definer RPCs only).

create extension if not exists pgcrypto;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.hr_learning_paths (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  node_id     uuid references public.org_nodes(id) on delete cascade,  -- null = org-wide
  name        text not null,
  description text not null default '',
  role        text not null default '',
  color       text not null default 'var(--t-accent)',
  position    integer not null default 0,
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.hr_learning_path_steps (
  id         uuid primary key default gen_random_uuid(),
  path_id    uuid not null references public.hr_learning_paths(id) on delete cascade,
  position   integer not null default 0,
  title      text not null,
  kind       text not null default 'course',
  mins       integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_learning_path_progress (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  path_id      uuid not null references public.hr_learning_paths(id) on delete cascade,
  step_id      uuid not null references public.hr_learning_path_steps(id) on delete cascade,
  person_id    uuid not null,
  person_name  text not null default '',
  done         boolean not null default true,
  completed_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (step_id, person_id)
);

create index if not exists idx_hr_lp_steps_path      on public.hr_learning_path_steps(path_id);
create index if not exists idx_hr_lp_progress_path   on public.hr_learning_path_progress(path_id);
create index if not exists idx_hr_lp_progress_person on public.hr_learning_path_progress(person_id);

alter table public.hr_learning_paths          enable row level security;
alter table public.hr_learning_path_steps     enable row level security;
alter table public.hr_learning_path_progress  enable row level security;

-- ── Read: all scoped paths, with steps + this person's progress + cohort stats ─
create or replace function public.hr_learning_paths_list(p_node_ids uuid[], p_person_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  select coalesce(jsonb_agg(x order by (x->>'position')::int, x->>'name'), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id',          p.id,
      'name',        p.name,
      'description', p.description,
      'role',        p.role,
      'color',       p.color,
      'node_id',     p.node_id,
      'position',    p.position,
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', s.id, 'title', s.title, 'kind', s.kind,
                 'mins', s.mins, 'position', s.position)
                 order by s.position, s.created_at)
        from hr_learning_path_steps s where s.path_id = p.id
      ), '[]'::jsonb),
      'total', (select count(*) from hr_learning_path_steps s where s.path_id = p.id),
      'my_progress', coalesce((
        select jsonb_object_agg(pr.step_id::text, jsonb_build_object(
                 'done', pr.done, 'at', pr.completed_at, 'by', pr.person_name))
        from hr_learning_path_progress pr
        where pr.path_id = p.id and p_person_id is not null and pr.person_id = p_person_id and pr.done
      ), '{}'::jsonb),
      'my_done', (
        select count(*) from hr_learning_path_progress pr
        where pr.path_id = p.id and p_person_id is not null and pr.person_id = p_person_id and pr.done
      ),
      'cohort_started', (
        select count(distinct pr.person_id) from hr_learning_path_progress pr
        where pr.path_id = p.id and pr.done
      ),
      'cohort_avg', coalesce((
        select round(avg(learner_pct))::int from (
          select (count(*)::numeric / nullif(
                    (select count(*) from hr_learning_path_steps s where s.path_id = p.id), 0) * 100) as learner_pct
          from hr_learning_path_progress pr
          where pr.path_id = p.id and pr.done
          group by pr.person_id
        ) t
      ), 0)
    ) as x
    from hr_learning_paths p
    where p.active
      and (p.node_id is null or (p_node_ids is not null and p.node_id = any(p_node_ids)))
  ) q;
  return jsonb_build_object('ok', true, 'paths', v_rows);
end; $$;

-- ── Write: create a path with ordered steps ──────────────────────────────────
create or replace function public.hr_learning_path_create(
  p_name text, p_description text, p_role text, p_steps jsonb,
  p_node_id uuid default null, p_color text default 'var(--t-accent)', p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_path uuid; v_pos int;
begin
  if p_name is null or length(btrim(p_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_steps');
  end if;
  if p_node_id is not null then
    select tenant_id into v_tenant from org_nodes where id = p_node_id;
  end if;

  select coalesce(max(position), 0) + 1 into v_pos from hr_learning_paths;

  insert into hr_learning_paths (tenant_id, node_id, name, description, role, color, position, created_by)
  values (v_tenant, p_node_id, btrim(p_name), coalesce(p_description, ''), coalesce(p_role, ''),
          coalesce(nullif(btrim(p_color), ''), 'var(--t-accent)'), v_pos, p_actor)
  returning id into v_path;

  insert into hr_learning_path_steps (path_id, position, title, kind, mins)
  select v_path, (elem.ord)::int,
         btrim(coalesce(elem.value->>'title', '')),
         coalesce(nullif(btrim(coalesce(elem.value->>'kind', '')), ''), 'course'),
         coalesce((elem.value->>'mins')::int, 0)
  from jsonb_array_elements(p_steps) with ordinality as elem(value, ord)
  where length(btrim(coalesce(elem.value->>'title', ''))) > 0;

  return jsonb_build_object('ok', true, 'id', v_path);
end; $$;

-- ── Write: mark a step complete for a person (idempotent) ─────────────────────
create or replace function public.hr_learning_step_complete(
  p_path_id uuid, p_step_id uuid, p_person_id uuid, p_person_name text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if p_path_id is null or p_step_id is null or p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_params');
  end if;
  if not exists (select 1 from hr_learning_path_steps where id = p_step_id and path_id = p_path_id) then
    return jsonb_build_object('ok', false, 'error', 'unknown_step');
  end if;
  select tenant_id into v_tenant from hr_learning_paths where id = p_path_id;

  insert into hr_learning_path_progress (tenant_id, path_id, step_id, person_id, person_name, done, completed_at)
  values (v_tenant, p_path_id, p_step_id, p_person_id, coalesce(p_person_name, ''), true, now())
  on conflict (step_id, person_id) do update
    set done = true, completed_at = now(), person_name = excluded.person_name;

  return jsonb_build_object('ok', true);
end; $$;

-- ── Write: delete (deactivate) a path ─────────────────────────────────────────
create or replace function public.hr_learning_path_delete(p_path_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from hr_learning_paths where id = p_path_id;
  return jsonb_build_object('ok', true);
end; $$;

revoke all on function public.hr_learning_paths_list(uuid[], uuid) from public;
revoke all on function public.hr_learning_path_create(text, text, text, jsonb, uuid, text, uuid) from public;
revoke all on function public.hr_learning_step_complete(uuid, uuid, uuid, text) from public;
revoke all on function public.hr_learning_path_delete(uuid) from public;
grant execute on function public.hr_learning_paths_list(uuid[], uuid) to anon, authenticated;
grant execute on function public.hr_learning_path_create(text, text, text, jsonb, uuid, text, uuid) to anon, authenticated;
grant execute on function public.hr_learning_step_complete(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.hr_learning_path_delete(uuid) to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname in
--  ('hr_learning_paths_list','hr_learning_path_create','hr_learning_step_complete','hr_learning_path_delete');
