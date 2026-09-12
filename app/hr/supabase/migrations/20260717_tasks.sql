-- ═══════════════════════════════════════════════════════════════════════════
-- Tasks screen — real backend for the two sub-features that had no store yet:
--   • Projects tab  (was a hardcoded PROJECTS array)
--   • Daily Checklists tab (was localStorage-as-datastore)
--
-- The core task list already runs on live RPCs and is REUSED as-is:
--   get_tasks(p_node_ids, p_person_id) · update_task_status(p_task_id, p_status, p_actor)
--   create_task(p_assigned_to, p_category, p_description, p_due_date, p_node_id,
--               p_person_id, p_priority, p_title) · add_comment / get_comments · get_roster
-- Nothing above is redefined here — we only add the missing tables/functions.
--
-- Conventions match this repo: tables stay RLS-locked, access is RPC-only
-- (security definer, search_path=public), execute granted to anon+authenticated.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PROJECTS ────────────────────────────────────────────────────────────────
create table if not exists public.task_projects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  node_id     uuid,                                   -- null = all locations
  name        text not null,
  description text,
  owner_name  text,
  priority    text not null default 'normal',         -- normal | high | urgent
  status      text not null default 'active',         -- active | review | complete
  due_date    date,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists task_projects_node_idx on public.task_projects (node_id, created_at desc);

-- Link tasks to a project (nullable; existing rows unaffected).
alter table public.user_tasks add column if not exists project_id uuid;
create index if not exists user_tasks_project_idx on public.user_tasks (project_id);

alter table public.task_projects enable row level security;

-- Projects in scope, with live progress derived from linked user_tasks.
create or replace function public.get_task_projects(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select p.id, p.node_id, n.name as node_name, p.name, p.description, p.owner_name,
           p.priority, p.status, p.due_date, p.created_at,
           (select count(*) from public.user_tasks ut where ut.project_id = p.id) as task_count,
           (select count(*) from public.user_tasks ut
              where ut.project_id = p.id
                and lower(ut.status) in ('complete','completed','done')) as done_count
    from public.task_projects p
    left join public.org_nodes n on n.id = p.node_id
    where p_node_ids is null
       or p.node_id is null
       or p.node_id = any(p_node_ids)
    order by p.created_at desc
  ) t;
$$;

create or replace function public.create_task_project(
  p_node_id     uuid,
  p_name        text,
  p_description text default null,
  p_owner_name  text default null,
  p_priority    text default 'normal',
  p_due_date    date default null,
  p_created_by  uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if coalesce(length(trim(p_name)), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'name required');
  end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  insert into public.task_projects
    (tenant_id, node_id, name, description, owner_name, priority, due_date, created_by)
  values
    (v_tenant, p_node_id, trim(p_name), p_description, nullif(trim(coalesce(p_owner_name,'')), ''),
     coalesce(nullif(trim(p_priority), ''), 'normal'), p_due_date, p_created_by)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Tasks that belong to a project (for the "View Tasks" drill).
create or replace function public.get_project_tasks(p_project_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.due_date asc nulls last), '[]'::jsonb)
  from (
    select ut.id, ut.title, ut.description, ut.category, ut.priority, ut.status,
           ut.due_date, ut.node_id, n.name as node_name,
           ut.assigned_to, pe.full_name as assignee_name
    from public.user_tasks ut
    left join public.org_nodes n on n.id = ut.node_id
    left join public.people pe on pe.id = ut.assigned_to
    where ut.project_id = p_project_id
  ) t;
$$;

-- ── DAILY CHECKLISTS ────────────────────────────────────────────────────────
-- One row per node+shift+date; item state (checked / note / photo) lives in a
-- jsonb map keyed by the template item id, plus a manager sign-off.
create table if not exists public.shift_checklist_runs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  node_id      uuid not null,
  shift        text not null,                          -- AM | PM | Closing
  run_date     date not null default current_date,
  items        jsonb not null default '{}'::jsonb,     -- { item_id: {checked,note,photo} }
  signed_off   boolean not null default false,
  signed_by    text,
  signed_by_id uuid,
  signed_at    timestamptz,
  updated_at   timestamptz not null default now(),
  unique (node_id, shift, run_date)
);
create index if not exists shift_checklist_runs_node_idx
  on public.shift_checklist_runs (node_id, run_date desc, shift);

alter table public.shift_checklist_runs enable row level security;

create or replace function public.get_shift_checklist(
  p_node_id uuid, p_shift text, p_date date
) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(t) from (
    select r.id, r.node_id, r.shift, r.run_date, r.items,
           r.signed_off, r.signed_by, r.signed_by_id, r.signed_at, r.updated_at
    from public.shift_checklist_runs r
    where r.node_id = p_node_id
      and r.shift = p_shift
      and r.run_date = coalesce(p_date, current_date)
    limit 1
  ) t;
$$;

-- Merge a single item's state. Blocks writes once signed off.
create or replace function public.set_shift_checklist_item(
  p_node_id    uuid,
  p_shift      text,
  p_date       date,
  p_item_id    text,
  p_checked    boolean default null,
  p_note       text    default null,
  p_photo      text    default null,
  p_actor_name text    default null,
  p_actor_id   uuid    default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_date   date := coalesce(p_date, current_date);
  v_signed boolean;
  v_prev   jsonb;
  v_next   jsonb;
begin
  if p_node_id is null or coalesce(length(trim(p_shift)),0) = 0 or coalesce(length(trim(p_item_id)),0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'node_id, shift and item_id required');
  end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;

  select signed_off, items->p_item_id into v_signed, v_prev
  from public.shift_checklist_runs
  where node_id = p_node_id and shift = p_shift and run_date = v_date;

  if coalesce(v_signed, false) then
    return jsonb_build_object('ok', false, 'error', 'signed_off');
  end if;

  -- Partial merge: null args keep the previously stored field.
  v_next := jsonb_build_object(
    'checked', coalesce(p_checked, (v_prev->>'checked')::boolean, false),
    'note',    coalesce(p_note,  v_prev->>'note',  ''),
    'photo',   coalesce(p_photo, v_prev->>'photo')
  );

  insert into public.shift_checklist_runs (tenant_id, node_id, shift, run_date, items, updated_at)
  values (v_tenant, p_node_id, p_shift, v_date, jsonb_build_object(p_item_id, v_next), now())
  on conflict (node_id, shift, run_date) do update set
    items      = public.shift_checklist_runs.items || jsonb_build_object(p_item_id, v_next),
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.sign_off_shift_checklist(
  p_node_id      uuid,
  p_shift        text,
  p_date         date,
  p_signed_by    text default null,
  p_signed_by_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_date date := coalesce(p_date, current_date);
begin
  if p_node_id is null then return jsonb_build_object('ok', false, 'error', 'node_id required'); end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;

  insert into public.shift_checklist_runs
    (tenant_id, node_id, shift, run_date, signed_off, signed_by, signed_by_id, signed_at, updated_at)
  values
    (v_tenant, p_node_id, p_shift, v_date, true, p_signed_by, p_signed_by_id, now(), now())
  on conflict (node_id, shift, run_date) do update set
    signed_off   = true,
    signed_by    = coalesce(p_signed_by, public.shift_checklist_runs.signed_by),
    signed_by_id = coalesce(p_signed_by_id, public.shift_checklist_runs.signed_by_id),
    signed_at    = now(),
    updated_at   = now();

  return jsonb_build_object('ok', true, 'signed_at', now());
end;
$$;

-- ── Grants (RPC-only; tables stay RLS-locked) ───────────────────────────────
revoke all on function public.get_task_projects(uuid[])                                  from public;
revoke all on function public.create_task_project(uuid, text, text, text, text, date, uuid) from public;
revoke all on function public.get_project_tasks(uuid)                                     from public;
revoke all on function public.get_shift_checklist(uuid, text, date)                       from public;
revoke all on function public.set_shift_checklist_item(uuid, text, date, text, boolean, text, text, text, uuid) from public;
revoke all on function public.sign_off_shift_checklist(uuid, text, date, text, uuid)      from public;

grant execute on function public.get_task_projects(uuid[])                                  to anon, authenticated;
grant execute on function public.create_task_project(uuid, text, text, text, text, date, uuid) to anon, authenticated;
grant execute on function public.get_project_tasks(uuid)                                     to anon, authenticated;
grant execute on function public.get_shift_checklist(uuid, text, date)                       to anon, authenticated;
grant execute on function public.set_shift_checklist_item(uuid, text, date, text, boolean, text, text, text, uuid) to anon, authenticated;
grant execute on function public.sign_off_shift_checklist(uuid, text, date, text, uuid)      to anon, authenticated;
