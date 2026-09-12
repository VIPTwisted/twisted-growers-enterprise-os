-- 1-on-1 Meeting Log — real backend for src/screens/OneOnOnes.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.one_on_ones (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid,
  node_id            uuid not null,
  employee_person_id uuid,
  employee_name      text not null,
  manager_person_id  uuid,
  manager_name       text,
  meeting_date       date not null default current_date,
  duration_min       int  not null default 30,
  topics             text[] not null default '{}',
  notes              text,
  employee_goals     text,
  follow_up_date     date,
  mood               text,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.one_on_one_action_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  meeting_id  uuid not null references public.one_on_ones(id) on delete cascade,
  description text not null,
  due_date    date,
  completed   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists one_on_ones_node_date_idx
  on public.one_on_ones (node_id, meeting_date desc);
create index if not exists one_on_ones_employee_idx
  on public.one_on_ones (employee_person_id);
create index if not exists one_on_one_action_items_meeting_idx
  on public.one_on_one_action_items (meeting_id);

alter table public.one_on_ones            enable row level security;
alter table public.one_on_one_action_items enable row level security;

-- ── Reads ────────────────────────────────────────────────────────────────────

-- Every meeting in the caller's location scope, newest first, with nested
-- action items. p_actor is accepted for call-site symmetry (the UI does the
-- my/all split client-side from manager_person_id).
create or replace function public.get_one_on_ones(p_node_ids uuid[], p_actor uuid default null)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(s.row order by s.meeting_date desc, s.created_at desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'id',                 m.id,
        'node_id',            m.node_id,
        'employee_person_id', m.employee_person_id,
        'employee_name',      m.employee_name,
        'manager_person_id',  m.manager_person_id,
        'manager_name',       m.manager_name,
        'meeting_date',       m.meeting_date,
        'duration_min',       m.duration_min,
        'topics',             coalesce(to_jsonb(m.topics), '[]'::jsonb),
        'notes',              m.notes,
        'employee_goals',     m.employee_goals,
        'follow_up_date',     m.follow_up_date,
        'mood',               m.mood,
        'created_by',         m.created_by,
        'action_items',       coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',          a.id,
            'description', a.description,
            'due_date',    a.due_date,
            'completed',   a.completed
          ) order by a.created_at)
          from public.one_on_one_action_items a
          where a.meeting_id = m.id
        ), '[]'::jsonb)
      ) as row,
      m.meeting_date,
      m.created_at
    from public.one_on_ones m
    where m.node_id = any(p_node_ids)
  ) s;
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

-- Log a new 1-on-1 plus its action items (jsonb array of {description,due_date}).
create or replace function public.create_one_on_one(
  p_node_id            uuid,
  p_employee_person_id uuid,
  p_employee_name      text,
  p_manager_person_id  uuid,
  p_manager_name       text,
  p_meeting_date       date,
  p_duration_min       int,
  p_topics             text[],
  p_notes              text,
  p_employee_goals     text,
  p_follow_up_date     date,
  p_mood               text,
  p_action_items       jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid; v_item jsonb;
begin
  if coalesce(trim(p_employee_name), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'employee_required');
  end if;

  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;

  insert into public.one_on_ones
    (tenant_id, node_id, employee_person_id, employee_name, manager_person_id,
     manager_name, meeting_date, duration_min, topics, notes, employee_goals,
     follow_up_date, mood, created_by)
  values
    (v_tenant, p_node_id, p_employee_person_id, p_employee_name, p_manager_person_id,
     p_manager_name, coalesce(p_meeting_date, current_date), coalesce(p_duration_min, 30),
     coalesce(p_topics, '{}'), p_notes, p_employee_goals,
     p_follow_up_date, p_mood, p_manager_person_id)
  returning id into v_id;

  if p_action_items is not null then
    for v_item in select * from jsonb_array_elements(p_action_items) loop
      if coalesce(trim(v_item->>'description'), '') <> '' then
        insert into public.one_on_one_action_items
          (tenant_id, meeting_id, description, due_date, completed)
        values
          (v_tenant, v_id, v_item->>'description',
           nullif(v_item->>'due_date', '')::date,
           coalesce((v_item->>'completed')::boolean, false));
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Flip (or explicitly set) an action item's completion state.
create or replace function public.toggle_one_on_one_action_item(
  p_item_id uuid, p_completed boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_state boolean;
begin
  update public.one_on_one_action_items
    set completed = coalesce(p_completed, not completed)
    where id = p_item_id
    returning completed into v_state;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'completed', v_state);
end;
$$;

-- Delete a meeting (action items cascade).
create or replace function public.delete_one_on_one(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from public.one_on_ones where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Grants (RPC-only access) ─────────────────────────────────────────────────

grant execute on function public.get_one_on_ones(uuid[], uuid)                     to anon, authenticated;
grant execute on function public.create_one_on_one(uuid, uuid, text, uuid, text, date, int, text[], text, text, date, text, jsonb) to anon, authenticated;
grant execute on function public.toggle_one_on_one_action_item(uuid, boolean)      to anon, authenticated;
grant execute on function public.delete_one_on_one(uuid)                           to anon, authenticated;
