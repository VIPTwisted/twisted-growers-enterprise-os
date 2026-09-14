-- Store Cleaning Logs — real backend for src/screens/CleaningLogs.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.cleaning_logs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  node_id       uuid not null,
  log_date      date not null,
  shift         text not null,
  area_id       text not null,
  item_id       text not null,
  checked       boolean not null default false,
  note          text,
  photo         text,
  completed_at  timestamptz,
  completed_by  text,
  completed_by_id uuid,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (node_id, log_date, shift, area_id, item_id)
);

create table if not exists public.cleaning_signoffs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  node_id       uuid not null,
  log_date      date not null,
  shift         text not null,
  manager_name  text,
  manager_id    uuid,
  signed_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (node_id, log_date, shift)
);

create table if not exists public.cleaning_issues (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid,
  node_id        uuid,
  log_date       date not null default current_date,
  area           text,
  item           text,
  note           text,
  reported_by    text,
  reported_by_id uuid,
  status         text not null default 'Open',
  resolved_at    timestamptz,
  resolved_by    text,
  created_at     timestamptz not null default now()
);

create index if not exists cleaning_logs_node_date_idx    on public.cleaning_logs (node_id, log_date);
create index if not exists cleaning_signoffs_node_date_idx on public.cleaning_signoffs (node_id, log_date);
create index if not exists cleaning_issues_node_idx        on public.cleaning_issues (node_id, status);

alter table public.cleaning_logs      enable row level security;
alter table public.cleaning_signoffs  enable row level security;
alter table public.cleaning_issues    enable row level security;

-- ── Reads ────────────────────────────────────────────────────────────────────

-- One location + shift + day: every touched item + the shift sign-off (or null).
create or replace function public.cleaning_shift_get(
  p_node_id uuid, p_date date, p_shift text
) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'area_id', l.area_id, 'item_id', l.item_id, 'checked', l.checked,
        'note', l.note, 'photo', l.photo,
        'completed_at', l.completed_at, 'completed_by', l.completed_by
      ))
      from public.cleaning_logs l
      where l.node_id = p_node_id and l.log_date = p_date and l.shift = p_shift
    ), '[]'::jsonb),
    'signoff', (
      select jsonb_build_object('manager_name', s.manager_name, 'signed_at', s.signed_at)
      from public.cleaning_signoffs s
      where s.node_id = p_node_id and s.log_date = p_date and s.shift = p_shift
      limit 1
    )
  );
$$;

-- Whole-day roll-up across many locations, for the KPI tiles.
create or replace function public.cleaning_day_get(
  p_node_ids uuid[], p_date date
) returns jsonb
language sql security definer set search_path = public as $$
  with done as (
    select node_id, shift, count(*) filter (where checked) as items_complete
    from public.cleaning_logs
    where node_id = any(p_node_ids) and log_date = p_date
    group by node_id, shift
  ),
  so as (
    select node_id, shift, manager_name from public.cleaning_signoffs
    where node_id = any(p_node_ids) and log_date = p_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'node_id', c.node_id, 'node_name', n.name, 'shift', c.shift,
    'items_complete', c.items_complete, 'signed_off_by', so.manager_name
  )), '[]'::jsonb)
  from done c
  left join so on so.node_id = c.node_id and so.shift = c.shift
  left join public.org_nodes n on n.id = c.node_id;
$$;

-- Historical compliance rows across a date window (per location/day/shift).
create or replace function public.cleaning_history(
  p_node_ids uuid[], p_date_from date, p_date_to date
) returns jsonb
language sql security definer set search_path = public as $$
  with done as (
    select l.node_id, l.log_date, l.shift,
           count(*) filter (where l.checked) as items_complete
    from public.cleaning_logs l
    where l.node_id = any(p_node_ids)
      and (p_date_from is null or l.log_date >= p_date_from)
      and (p_date_to   is null or l.log_date <= p_date_to)
    group by l.node_id, l.log_date, l.shift
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'node_id', d.node_id, 'node_name', n.name, 'log_date', d.log_date,
    'shift', d.shift, 'items_complete', d.items_complete,
    'signed_off_by', s.manager_name, 'sign_off_time', s.signed_at
  ) order by d.log_date desc), '[]'::jsonb)
  from done d
  left join public.cleaning_signoffs s
    on s.node_id = d.node_id and s.log_date = d.log_date and s.shift = d.shift
  left join public.org_nodes n on n.id = d.node_id;
$$;

create or replace function public.cleaning_issues_list(
  p_node_ids uuid[]
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'log_date', i.log_date, 'node_id', i.node_id, 'node_name', n.name,
    'area', i.area, 'item', i.item, 'note', i.note, 'reported_by', i.reported_by,
    'status', i.status, 'resolved_at', i.resolved_at, 'resolved_by', i.resolved_by
  ) order by i.created_at desc), '[]'::jsonb)
  from public.cleaning_issues i
  left join public.org_nodes n on n.id = i.node_id
  where i.node_id = any(p_node_ids) or i.node_id is null;
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

-- Upsert one checklist item's full state (idempotent per unique key).
create or replace function public.cleaning_item_set(
  p_node_id uuid, p_date date, p_shift text, p_area_id text, p_item_id text,
  p_checked boolean, p_note text, p_photo text, p_by text, p_by_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;
  insert into public.cleaning_logs
    (tenant_id, node_id, log_date, shift, area_id, item_id, checked, note, photo,
     completed_at, completed_by, completed_by_id, updated_at)
  values
    (v_tenant, p_node_id, p_date, p_shift, p_area_id, p_item_id, coalesce(p_checked,false),
     p_note, p_photo,
     case when coalesce(p_checked,false) then now() else null end, p_by, p_by_id, now())
  on conflict (node_id, log_date, shift, area_id, item_id) do update
    set checked      = excluded.checked,
        note         = excluded.note,
        photo        = excluded.photo,
        completed_at = case when excluded.checked
                            then coalesce(public.cleaning_logs.completed_at, now())
                            else null end,
        completed_by = case when excluded.checked then excluded.completed_by
                            else public.cleaning_logs.completed_by end,
        completed_by_id = case when excluded.checked then excluded.completed_by_id
                            else public.cleaning_logs.completed_by_id end,
        updated_at   = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.cleaning_signoff(
  p_node_id uuid, p_date date, p_shift text, p_manager text, p_manager_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_at timestamptz;
begin
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;
  insert into public.cleaning_signoffs
    (tenant_id, node_id, log_date, shift, manager_name, manager_id, signed_at)
  values (v_tenant, p_node_id, p_date, p_shift, p_manager, p_manager_id, now())
  on conflict (node_id, log_date, shift) do update
    set manager_name = excluded.manager_name,
        manager_id   = excluded.manager_id,
        signed_at    = now()
  returning signed_at into v_at;
  return jsonb_build_object('ok', true, 'signed_at', v_at);
end;
$$;

create or replace function public.cleaning_issue_create(
  p_node_id uuid, p_date date, p_area text, p_item text, p_note text,
  p_by text, p_by_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;
  insert into public.cleaning_issues
    (tenant_id, node_id, log_date, area, item, note, reported_by, reported_by_id, status)
  values (v_tenant, p_node_id, coalesce(p_date, current_date), p_area, p_item, p_note,
          p_by, p_by_id, 'Open')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.cleaning_issue_resolve(
  p_id uuid, p_by text
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.cleaning_issues
    set status = 'Resolved', resolved_at = now(), resolved_by = p_by
    where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Grants (RPC-only access; tables stay RLS-locked) ─────────────────────────

grant execute on function public.cleaning_shift_get(uuid, date, text)                to anon, authenticated;
grant execute on function public.cleaning_day_get(uuid[], date)                      to anon, authenticated;
grant execute on function public.cleaning_history(uuid[], date, date)                to anon, authenticated;
grant execute on function public.cleaning_issues_list(uuid[])                        to anon, authenticated;
grant execute on function public.cleaning_item_set(uuid, date, text, text, text, boolean, text, text, text, uuid) to anon, authenticated;
grant execute on function public.cleaning_signoff(uuid, date, text, text, uuid)      to anon, authenticated;
grant execute on function public.cleaning_issue_create(uuid, date, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.cleaning_issue_resolve(uuid, text)                  to anon, authenticated;
