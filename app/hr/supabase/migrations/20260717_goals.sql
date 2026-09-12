-- Goals & Targets — real backend for src/screens/Goals.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon table policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.
--
-- Reuses existing shapes: people(id, full_name), org_nodes(id, name, tenant_id,
-- node_type), assignments(person_id, node_id, effective_from). Employees for the
-- assignment picker come from the existing get_roster RPC (not duplicated here).

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.hr_goals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  person_id     uuid not null references public.people(id) on delete cascade,
  node_id       uuid references public.org_nodes(id),
  category      text not null default 'Personal',      -- Sales|Attendance|Training|Leadership|Personal
  title         text not null,
  description   text,
  target_value  numeric not null default 0,
  current_value numeric not null default 0,
  unit          text not null default 'count',         -- dollars|count|percent|shifts|score
  priority      text not null default 'Medium',        -- High|Medium|Low
  stretch       boolean not null default false,
  start_date    date,
  due_date      date,
  status        text not null default 'on-track',      -- on-track|at-risk|overdue|complete|canceled
  set_by        text,
  notes         text,
  milestones    jsonb not null default '[]'::jsonb,    -- ["desc", ...]
  contest_link  text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists hr_goals_person_idx on public.hr_goals (person_id);
create index if not exists hr_goals_node_idx   on public.hr_goals (node_id);
create index if not exists hr_goals_due_idx     on public.hr_goals (due_date);

alter table public.hr_goals enable row level security;

-- Nudge log — records real "nudge" pings sent to at-risk employees.
create table if not exists public.hr_goal_nudges (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  from_id     uuid,
  message     text,
  created_at  timestamptz not null default now()
);
create index if not exists hr_goal_nudges_person_idx on public.hr_goal_nudges (person_id, created_at desc);
alter table public.hr_goal_nudges enable row level security;

-- ── Read ─────────────────────────────────────────────────────────────────────
-- get_goals already existed in this project (empty sales-metric variant); the
-- Goals screen is the only consumer. Repoint it at the rich hr_goals model.
-- Return type changes, so drop known prior signatures first.
drop function if exists public.get_goals(uuid[]);
drop function if exists public.get_goals(text[]);

create or replace function public.get_goals(
  p_node_ids uuid[]
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.due), '[]'::jsonb)
  from (
    select g.id,
           g.person_id,
           p.full_name                as person_name,
           g.node_id,
           n.name                     as location,
           g.category,
           g.title,
           g.description,
           g.target_value             as target,
           g.current_value            as current,
           g.unit,
           g.priority,
           g.stretch,
           to_char(g.start_date, 'YYYY-MM-DD') as start,
           to_char(g.due_date,   'YYYY-MM-DD') as due,
           g.status,
           g.set_by,
           g.notes,
           g.milestones,
           g.contest_link
    from public.hr_goals g
    left join public.people    p on p.id = g.person_id
    left join public.org_nodes n on n.id = g.node_id
    where p_node_ids is null
       or array_length(p_node_ids, 1) is null
       or g.node_id = any(p_node_ids)
    order by g.due
  ) t;
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

create or replace function public.create_goal(
  p_person_id   uuid,
  p_category    text,
  p_title       text,
  p_target      numeric,
  p_unit        text        default 'count',
  p_due_date    date        default null,
  p_start_date  date        default null,
  p_priority    text        default 'Medium',
  p_stretch     boolean     default false,
  p_description text        default null,
  p_milestones  jsonb       default '[]'::jsonb,
  p_contest_link text       default null,
  p_set_by      text        default null,
  p_created_by  uuid        default null,
  p_node_id     uuid        default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_tenant uuid; v_id uuid;
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'person required');
  end if;
  if coalesce(length(trim(p_title)), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'title required');
  end if;

  v_node := p_node_id;
  if v_node is null then
    select a.node_id into v_node
    from public.assignments a
    where a.person_id = p_person_id
    order by a.effective_from desc nulls last
    limit 1;
  end if;

  select tenant_id into v_tenant from public.org_nodes where id = v_node limit 1;

  insert into public.hr_goals
    (tenant_id, person_id, node_id, category, title, description, target_value,
     current_value, unit, priority, stretch, start_date, due_date, status,
     set_by, milestones, contest_link, created_by)
  values
    (v_tenant, p_person_id, v_node, coalesce(nullif(trim(p_category), ''), 'Personal'),
     trim(p_title), p_description, coalesce(p_target, 0), 0,
     coalesce(nullif(trim(p_unit), ''), 'count'),
     coalesce(nullif(trim(p_priority), ''), 'Medium'), coalesce(p_stretch, false),
     p_start_date, p_due_date, 'on-track', p_set_by,
     coalesce(p_milestones, '[]'::jsonb), p_contest_link, p_created_by)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- update_goal_progress previously targeted sales_goals; repoint at hr_goals.
drop function if exists public.update_goal_progress(uuid, numeric, text);

create or replace function public.update_goal_progress(
  p_goal_id uuid, p_progress numeric, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.hr_goals
     set current_value = p_progress,
         notes = case when coalesce(p_note, '') <> ''
                   then coalesce(nullif(notes, ''), '') ||
                        case when coalesce(nullif(notes,''),'') <> '' then E'\n' else '' end ||
                        '[' || to_char(current_date, 'YYYY-MM-DD') || '] ' || p_note
                   else notes end,
         status = case when p_progress >= target_value and target_value > 0
                    then 'complete' else status end,
         updated_at = now()
   where id = p_goal_id
   returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'goal not found');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.goal_set_status(
  p_goal_id uuid, p_status text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.hr_goals
     set status = p_status,
         current_value = case when p_status = 'complete' and current_value < target_value
                           then target_value else current_value end,
         updated_at = now()
   where id = p_goal_id
   returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'goal not found');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.goal_delete(
  p_goal_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from public.hr_goals where id = p_goal_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.goal_nudge(
  p_person_ids uuid[], p_from uuid default null, p_message text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if p_person_ids is null or array_length(p_person_ids, 1) is null then
    return jsonb_build_object('ok', true, 'count', 0);
  end if;
  insert into public.hr_goal_nudges (person_id, from_id, message)
  select pid, p_from, p_message
  from unnest(p_person_ids) as pid;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

-- ── Grants (RPC-only access; tables stay RLS-locked) ─────────────────────────

grant execute on function public.get_goals(uuid[])                                                     to anon, authenticated;
grant execute on function public.create_goal(uuid, text, text, numeric, text, date, date, text, boolean, text, jsonb, text, text, uuid, uuid) to anon, authenticated;
grant execute on function public.update_goal_progress(uuid, numeric, text)                             to anon, authenticated;
grant execute on function public.goal_set_status(uuid, text)                                           to anon, authenticated;
grant execute on function public.goal_delete(uuid)                                                     to anon, authenticated;
grant execute on function public.goal_nudge(uuid[], uuid, text)                                        to anon, authenticated;
