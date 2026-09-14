-- ─────────────────────────────────────────────────────────────────────────────
-- Daily Huddle backend — real data for src/screens/Huddle.jsx  (2026-07-17)
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- The Huddle screen previously stored EVERYTHING in localStorage + deterministic
-- Math-seeded mocks (huddle board, announcements, team-update posts, tasks) and
-- called a phantom get_huddles() that never existed. This migration gives the
-- huddle its own real, per-node, per-date tables + SECURITY DEFINER RPCs.
--
-- REUSES existing capabilities for the rest of the screen (no duplication):
--   • Who's In / coverage : get_roster, scope_shifts, get_all_time_entries
--   • Floor Coverage zones: get_zone_assignments / set_zone_assignment
--   • Sales target vs pace: get_cockpit_sales (per-node today_amount / daily_goal)
--
-- Shapes reused: org_nodes(id, name, tenant_id).
-- Idempotent: create ... if not exists / create or replace. RLS ON, no anon
-- policies — the granted SECURITY DEFINER RPCs are the only access path.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.huddle_boards (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid,
  node_id        uuid not null,
  huddle_date    date not null default current_date,
  priorities     jsonb not null default '[]'::jsonb,   -- ["...", "...", "..."]
  sales_goal     numeric,
  training_goal  int,
  notes          text,
  updated_by     text,
  updated_by_id  uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (node_id, huddle_date)
);
create index if not exists huddle_boards_node_date_idx on public.huddle_boards (node_id, huddle_date desc);

create table if not exists public.huddle_announcements (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  node_id      uuid not null,
  huddle_date  date not null default current_date,
  body         text not null,
  author_name  text,
  author_id    uuid,
  created_at   timestamptz not null default now()
);
create index if not exists huddle_announcements_node_date_idx on public.huddle_announcements (node_id, huddle_date desc, created_at desc);

create table if not exists public.huddle_posts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  node_id      uuid not null,
  huddle_date  date not null default current_date,
  body         text not null,
  author_name  text,
  author_id    uuid,
  created_at   timestamptz not null default now()
);
create index if not exists huddle_posts_node_date_idx on public.huddle_posts (node_id, huddle_date desc, created_at desc);

create table if not exists public.huddle_tasks (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid,
  node_id        uuid not null,
  huddle_date    date not null default current_date,
  description    text not null,
  assignee_name  text,
  assignee_id    uuid,
  due_label      text not null default 'End of shift',
  priority       text not null default 'normal',       -- low | normal | high
  is_complete    boolean not null default false,
  created_by     text,
  created_by_id  uuid,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index if not exists huddle_tasks_node_date_idx on public.huddle_tasks (node_id, huddle_date desc, created_at desc);

alter table public.huddle_boards        enable row level security;
alter table public.huddle_announcements enable row level security;
alter table public.huddle_posts         enable row level security;
alter table public.huddle_tasks         enable row level security;

-- ── Board: read ──────────────────────────────────────────────────────────────
-- Returns the single most-recently-updated board across the scoped nodes for the
-- given date, or null when no huddle was set. get_* prefix keeps the client
-- rpc-wrapper quiet if not yet deployed.
create or replace function public.get_huddle_board(p_node_ids uuid[], p_date date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(t) from (
    select b.id, b.node_id, n.name as node_name, b.huddle_date,
           b.priorities, b.sales_goal, b.training_goal, b.notes,
           b.updated_by, b.updated_by_id, b.updated_at
    from public.huddle_boards b
    left join public.org_nodes n on n.id = b.node_id
    where b.node_id = any(p_node_ids)
      and b.huddle_date = coalesce(p_date, current_date)
    order by b.updated_at desc
    limit 1
  ) t;
$$;

-- ── Board: upsert (partial merge — null args keep the stored value) ──────────
create or replace function public.set_huddle_board(
  p_node_id      uuid,
  p_date         date,
  p_priorities   jsonb   default null,
  p_sales_goal   numeric default null,
  p_training_goal int    default null,
  p_notes        text    default null,
  p_updated_by   text    default null,
  p_updated_by_id uuid   default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_date date := coalesce(p_date, current_date); v_id uuid;
begin
  if p_node_id is null then
    return jsonb_build_object('ok', false, 'error', 'node_id required');
  end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;

  insert into public.huddle_boards
    (tenant_id, node_id, huddle_date, priorities, sales_goal, training_goal,
     notes, updated_by, updated_by_id, updated_at)
  values
    (v_tenant, p_node_id, v_date, coalesce(p_priorities, '[]'::jsonb),
     p_sales_goal, p_training_goal, p_notes, p_updated_by, p_updated_by_id, now())
  on conflict (node_id, huddle_date) do update set
    priorities    = coalesce(p_priorities,    public.huddle_boards.priorities),
    sales_goal    = coalesce(p_sales_goal,    public.huddle_boards.sales_goal),
    training_goal = coalesce(p_training_goal, public.huddle_boards.training_goal),
    notes         = coalesce(p_notes,         public.huddle_boards.notes),
    updated_by    = coalesce(p_updated_by,    public.huddle_boards.updated_by),
    updated_by_id = coalesce(p_updated_by_id, public.huddle_boards.updated_by_id),
    updated_at    = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── Announcements ────────────────────────────────────────────────────────────
create or replace function public.get_huddle_announcements(p_node_ids uuid[], p_date date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select a.id, a.node_id, a.huddle_date, a.body, a.author_name, a.author_id, a.created_at
    from public.huddle_announcements a
    where a.node_id = any(p_node_ids)
      and a.huddle_date = coalesce(p_date, current_date)
    order by a.created_at desc
  ) t;
$$;

create or replace function public.post_huddle_announcement(
  p_node_id uuid, p_date date, p_body text, p_author_name text, p_author_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_node_id is null then return jsonb_build_object('ok', false, 'error', 'node_id required'); end if;
  if coalesce(length(trim(p_body)), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  insert into public.huddle_announcements (tenant_id, node_id, huddle_date, body, author_name, author_id)
  values (v_tenant, p_node_id, coalesce(p_date, current_date), trim(p_body), p_author_name, p_author_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.delete_huddle_announcement(p_id uuid, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from public.huddle_announcements where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Team-update posts ────────────────────────────────────────────────────────
create or replace function public.get_huddle_posts(p_node_ids uuid[], p_date date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  from (
    select p.id, p.node_id, p.huddle_date, p.body, p.author_name, p.author_id, p.created_at
    from public.huddle_posts p
    where p.node_id = any(p_node_ids)
      and p.huddle_date = coalesce(p_date, current_date)
    order by p.created_at desc
  ) t;
$$;

create or replace function public.post_huddle_post(
  p_node_id uuid, p_date date, p_body text, p_author_name text, p_author_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_node_id is null then return jsonb_build_object('ok', false, 'error', 'node_id required'); end if;
  if coalesce(length(trim(p_body)), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  insert into public.huddle_posts (tenant_id, node_id, huddle_date, body, author_name, author_id)
  values (v_tenant, p_node_id, coalesce(p_date, current_date), trim(p_body), p_author_name, p_author_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── Huddle tasks ─────────────────────────────────────────────────────────────
create or replace function public.get_huddle_tasks(p_node_ids uuid[], p_date date)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at asc), '[]'::jsonb)
  from (
    select k.id, k.node_id, k.huddle_date, k.description, k.assignee_name, k.assignee_id,
           k.due_label, k.priority, k.is_complete, k.created_by, k.created_at, k.completed_at
    from public.huddle_tasks k
    where k.node_id = any(p_node_ids)
      and k.huddle_date = coalesce(p_date, current_date)
    order by k.created_at asc
  ) t;
$$;

create or replace function public.create_huddle_task(
  p_node_id uuid, p_date date, p_description text, p_assignee_name text,
  p_assignee_id uuid, p_due_label text, p_priority text, p_created_by text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_node_id is null then return jsonb_build_object('ok', false, 'error', 'node_id required'); end if;
  if coalesce(length(trim(p_description)), 0) = 0 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  insert into public.huddle_tasks
    (tenant_id, node_id, huddle_date, description, assignee_name, assignee_id,
     due_label, priority, created_by)
  values
    (v_tenant, p_node_id, coalesce(p_date, current_date), trim(p_description),
     p_assignee_name, p_assignee_id, coalesce(nullif(trim(p_due_label), ''), 'End of shift'),
     coalesce(nullif(trim(p_priority), ''), 'normal'), p_created_by)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.set_huddle_task_complete(p_id uuid, p_complete boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.huddle_tasks
     set is_complete  = coalesce(p_complete, false),
         completed_at = case when coalesce(p_complete, false) then now() else null end
   where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.delete_huddle_task(p_id uuid, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from public.huddle_tasks where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Grants (RPC-only; tables stay RLS-locked) ────────────────────────────────
revoke all on function public.get_huddle_board(uuid[], date)                          from public;
revoke all on function public.set_huddle_board(uuid, date, jsonb, numeric, int, text, text, uuid) from public;
revoke all on function public.get_huddle_announcements(uuid[], date)                  from public;
revoke all on function public.post_huddle_announcement(uuid, date, text, text, uuid)  from public;
revoke all on function public.delete_huddle_announcement(uuid, uuid)                  from public;
revoke all on function public.get_huddle_posts(uuid[], date)                          from public;
revoke all on function public.post_huddle_post(uuid, date, text, text, uuid)          from public;
revoke all on function public.get_huddle_tasks(uuid[], date)                          from public;
revoke all on function public.create_huddle_task(uuid, date, text, text, uuid, text, text, text) from public;
revoke all on function public.set_huddle_task_complete(uuid, boolean)                 from public;
revoke all on function public.delete_huddle_task(uuid, uuid)                          from public;

grant execute on function public.get_huddle_board(uuid[], date)                          to anon, authenticated;
grant execute on function public.set_huddle_board(uuid, date, jsonb, numeric, int, text, text, uuid) to anon, authenticated;
grant execute on function public.get_huddle_announcements(uuid[], date)                  to anon, authenticated;
grant execute on function public.post_huddle_announcement(uuid, date, text, text, uuid)  to anon, authenticated;
grant execute on function public.delete_huddle_announcement(uuid, uuid)                  to anon, authenticated;
grant execute on function public.get_huddle_posts(uuid[], date)                          to anon, authenticated;
grant execute on function public.post_huddle_post(uuid, date, text, text, uuid)          to anon, authenticated;
grant execute on function public.get_huddle_tasks(uuid[], date)                          to anon, authenticated;
grant execute on function public.create_huddle_task(uuid, date, text, text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.set_huddle_task_complete(uuid, boolean)                 to anon, authenticated;
grant execute on function public.delete_huddle_task(uuid, uuid)                          to anon, authenticated;
