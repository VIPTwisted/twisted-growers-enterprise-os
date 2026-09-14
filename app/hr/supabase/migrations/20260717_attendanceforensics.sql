-- Attendance Forensics backend (real, RPC-only) for src/screens/AttendanceForensics.jsx.
-- The screen previously fabricated its ENTIRE dataset from a deterministic seed()
-- generator (18 hardcoded employees, seeded statuses/punches/Bradford) plus
-- localStorage for thresholds and flags. This migration provides the real
-- persistence the screen's WRITE actions need. All READ analytics are derived on
-- the client from the already-real get_attendance_overview(p_node_ids) RPC
-- (roster + tardy/callout/ncns incidents from public.attendance_incidents).
--
-- Model follows the app's pin_login/anon convention: RLS ON, no anon policy,
-- SECURITY DEFINER RPCs (which bypass RLS) granted to anon + authenticated.
-- Tenant is always derived from the node, never trusted from the client.
-- Column shapes reused from live schema (verified against sibling RPCs):
--   people(id, full_name, is_active)   org_nodes(id, name, tenant_id)
-- Idempotent — safe to re-run.

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Bradford Factor thresholds — per tenant (replaces localStorage vip_brad_thresholds)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.af_bradford_thresholds (
  tenant_id   uuid primary key,
  warn        int not null default 200,
  final_warn  int not null default 500,
  term_risk   int not null default 900,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);
alter table public.af_bradford_thresholds enable row level security;

create or replace function public.af_get_bradford_thresholds(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select jsonb_build_object('warn', t.warn, 'final_warn', t.final_warn, 'term_risk', t.term_risk)
       from af_bradford_thresholds t
       where t.tenant_id = (select tenant_id from org_nodes where id = any(p_node_ids) limit 1)),
    jsonb_build_object('warn', 200, 'final_warn', 500, 'term_risk', 900)
  );
$$;

create or replace function public.af_set_bradford_thresholds(
  p_node_id uuid, p_warn int, p_final_warn int, p_term_risk int, p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from org_nodes where id = p_node_id limit 1;
  if v_tenant is null then raise exception 'Unknown node %', p_node_id; end if;
  insert into public.af_bradford_thresholds(tenant_id, warn, final_warn, term_risk, updated_by, updated_at)
  values (v_tenant, greatest(0, coalesce(p_warn,200)), greatest(0, coalesce(p_final_warn,500)),
          greatest(0, coalesce(p_term_risk,900)), p_actor, now())
  on conflict (tenant_id) do update
    set warn = excluded.warn, final_warn = excluded.final_warn,
        term_risk = excluded.term_risk, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('ok', true, 'warn', greatest(0, coalesce(p_warn,200)),
    'final_warn', greatest(0, coalesce(p_final_warn,500)), 'term_risk', greatest(0, coalesce(p_term_risk,900)));
end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Employee flags (replaces localStorage vip_brad_flagged)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.af_employee_flags (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  node_id     uuid,
  person_id   uuid not null,
  note        text,
  flagged_by  uuid,
  created_at  timestamptz not null default now(),
  unique (tenant_id, person_id)
);
create index if not exists af_employee_flags_tenant_idx on public.af_employee_flags(tenant_id);
alter table public.af_employee_flags enable row level security;

create or replace function public.af_get_flags(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(f.person_id), '[]'::jsonb)
  from af_employee_flags f
  where f.tenant_id = (select tenant_id from org_nodes where id = any(p_node_ids) limit 1);
$$;

create or replace function public.af_toggle_flag(
  p_node_id uuid, p_person_id uuid, p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_tenant uuid; v_exists uuid;
begin
  select tenant_id into v_tenant from org_nodes where id = p_node_id limit 1;
  if v_tenant is null then raise exception 'Unknown node %', p_node_id; end if;
  select id into v_exists from af_employee_flags where tenant_id = v_tenant and person_id = p_person_id;
  if v_exists is not null then
    delete from af_employee_flags where id = v_exists;
    return jsonb_build_object('ok', true, 'flagged', false);
  end if;
  insert into public.af_employee_flags(tenant_id, node_id, person_id, flagged_by)
  values (v_tenant, p_node_id, p_person_id, p_actor);
  return jsonb_build_object('ok', true, 'flagged', true);
end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 3) AI warning decisions — approve / edit / ignore (persist manager actions)
--    warning_key is a stable client-derived key: person_id|type|latest-date
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.af_warning_actions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  node_id     uuid,
  person_id   uuid,
  warning_key text not null,
  status      text not null default 'pending' check (status in ('pending','approved','ignored')),
  message     text,
  decided_by  uuid,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (tenant_id, warning_key)
);
create index if not exists af_warning_actions_tenant_idx on public.af_warning_actions(tenant_id);
alter table public.af_warning_actions enable row level security;

create or replace function public.af_get_warning_actions(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'warning_key', a.warning_key, 'status', a.status, 'message', a.message,
    'decided_by', a.decided_by, 'decided_at', a.decided_at)), '[]'::jsonb)
  from af_warning_actions a
  where a.tenant_id = (select tenant_id from org_nodes where id = any(p_node_ids) limit 1);
$$;

create or replace function public.af_set_warning_action(
  p_node_id uuid, p_person_id uuid, p_warning_key text, p_status text,
  p_message text default null, p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_tenant uuid;
begin
  if p_status not in ('pending','approved','ignored') then
    raise exception 'Invalid status %', p_status;
  end if;
  select tenant_id into v_tenant from org_nodes where id = p_node_id limit 1;
  if v_tenant is null then raise exception 'Unknown node %', p_node_id; end if;
  insert into public.af_warning_actions(tenant_id, node_id, person_id, warning_key, status, message, decided_by, decided_at)
  values (v_tenant, p_node_id, p_person_id, p_warning_key, p_status, p_message, p_actor, now())
  on conflict (tenant_id, warning_key) do update
    set status = excluded.status, message = coalesce(excluded.message, af_warning_actions.message),
        decided_by = excluded.decided_by, decided_at = now();
  return jsonb_build_object('ok', true, 'warning_key', p_warning_key, 'status', p_status);
end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) Alert dismissals (persist "Dismiss Alert")
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.af_alert_dismissals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  node_id       uuid,
  alert_key     text not null,
  dismissed_by  uuid,
  created_at    timestamptz not null default now(),
  unique (tenant_id, alert_key)
);
alter table public.af_alert_dismissals enable row level security;

create or replace function public.af_get_alert_dismissals(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(d.alert_key), '[]'::jsonb)
  from af_alert_dismissals d
  where d.tenant_id = (select tenant_id from org_nodes where id = any(p_node_ids) limit 1);
$$;

create or replace function public.af_dismiss_alert(
  p_node_id uuid, p_alert_key text, p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from org_nodes where id = p_node_id limit 1;
  if v_tenant is null then raise exception 'Unknown node %', p_node_id; end if;
  insert into public.af_alert_dismissals(tenant_id, node_id, alert_key, dismissed_by)
  values (v_tenant, p_node_id, p_alert_key, p_actor)
  on conflict (tenant_id, alert_key) do nothing;
  return jsonb_build_object('ok', true, 'alert_key', p_alert_key);
end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5) Return-to-work check-ins (persist RTW completions)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.af_rtw_checkins (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  node_id            uuid not null,
  person_id          uuid not null,
  callout_date       date,
  return_date        date,
  absence_type       text,
  illness_related    boolean not null default false,
  needs_accommodation boolean not null default false,
  accommodation_note text,
  medical_clearance  boolean not null default false,
  notes              text,
  completed_by       uuid,
  completed_by_name  text,
  completed_at       timestamptz not null default now()
);
create index if not exists af_rtw_checkins_node_idx on public.af_rtw_checkins(node_id);
create index if not exists af_rtw_checkins_person_idx on public.af_rtw_checkins(person_id);
alter table public.af_rtw_checkins enable row level security;

create or replace function public.af_list_rtw(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'person_id', c.person_id,
    'full_name', p.full_name,
    'node_id', c.node_id,
    'location', n.name,
    'callout_date', to_char(c.callout_date,'YYYY-MM-DD'),
    'return_date', to_char(c.return_date,'YYYY-MM-DD'),
    'absence_type', c.absence_type,
    'illness_related', c.illness_related,
    'needs_accommodation', c.needs_accommodation,
    'accommodation_note', c.accommodation_note,
    'medical_clearance', c.medical_clearance,
    'notes', c.notes,
    'completed_by_name', c.completed_by_name,
    'completed_at', to_char(c.completed_at,'YYYY-MM-DD"T"HH24:MI:SSOF')
  ) order by c.completed_at desc), '[]'::jsonb)
  from af_rtw_checkins c
  join org_nodes n on n.id = c.node_id
  left join people p on p.id = c.person_id
  where c.node_id = any(p_node_ids);
$$;

create or replace function public.af_complete_rtw(
  p_node_id uuid, p_person_id uuid, p_callout_date date, p_return_date date,
  p_absence_type text, p_illness boolean default false, p_needs_accom boolean default false,
  p_accom_note text default null, p_med_clearance boolean default false,
  p_notes text default null, p_actor uuid default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_tenant uuid; v_name text; v_id uuid;
begin
  select tenant_id into v_tenant from org_nodes where id = p_node_id limit 1;
  if v_tenant is null then raise exception 'Unknown node %', p_node_id; end if;
  select full_name into v_name from people where id = p_actor;
  insert into public.af_rtw_checkins(
    tenant_id, node_id, person_id, callout_date, return_date, absence_type,
    illness_related, needs_accommodation, accommodation_note, medical_clearance,
    notes, completed_by, completed_by_name)
  values (v_tenant, p_node_id, p_person_id, p_callout_date, p_return_date, p_absence_type,
    coalesce(p_illness,false), coalesce(p_needs_accom,false), p_accom_note,
    coalesce(p_med_clearance,false), p_notes, p_actor, v_name)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Grants (app auth = pin_login → anon role)
-- ════════════════════════════════════════════════════════════════════════════
grant execute on function public.af_get_bradford_thresholds(uuid[]) to anon, authenticated;
grant execute on function public.af_set_bradford_thresholds(uuid,int,int,int,uuid) to anon, authenticated;
grant execute on function public.af_get_flags(uuid[]) to anon, authenticated;
grant execute on function public.af_toggle_flag(uuid,uuid,uuid) to anon, authenticated;
grant execute on function public.af_get_warning_actions(uuid[]) to anon, authenticated;
grant execute on function public.af_set_warning_action(uuid,uuid,text,text,text,uuid) to anon, authenticated;
grant execute on function public.af_get_alert_dismissals(uuid[]) to anon, authenticated;
grant execute on function public.af_dismiss_alert(uuid,text,uuid) to anon, authenticated;
grant execute on function public.af_list_rtw(uuid[]) to anon, authenticated;
grant execute on function public.af_complete_rtw(uuid,uuid,date,date,text,boolean,boolean,text,boolean,text,uuid) to anon, authenticated;
