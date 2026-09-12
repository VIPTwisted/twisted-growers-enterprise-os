-- HR Dashboard (src/screens/HRDashboard.jsx) — real backend for the two
-- capabilities that had NO existing table/RPC: employee certifications
-- (expiring-cert tracking) and scheduled training drills.
--
-- Every other tile/table on the dashboard reuses existing RPCs:
--   get_roster, scope_shifts, forensic_callouts, get_coverage_gaps,
--   get_disciplinary_actions, get_pending_requests, get_training_matrix,
--   fmla_cases.
--
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, NO anon table policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.

-- ── Certifications ───────────────────────────────────────────────────────────

create table if not exists public.employee_certifications (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  person_id    uuid,
  node_id      uuid,
  cert_name    text not null,
  issued_date  date,
  expiry_date  date,
  status       text not null default 'active',   -- active | renewal_scheduled | expired
  notes        text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists employee_certifications_node_idx
  on public.employee_certifications (node_id, expiry_date);

alter table public.employee_certifications enable row level security;

-- Expiring / all certifications for a set of locations.
-- p_within_days null → return every cert; otherwise only those expiring within N days.
create or replace function public.get_expiring_certifications(
  p_node_ids uuid[], p_within_days int default 30
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.days_left asc nulls last), '[]'::jsonb)
  from (
    select c.id,
           c.person_id,
           coalesce(p.full_name, '—')                    as employee,
           c.cert_name                                   as cert,
           coalesce(n.name, '—')                         as location,
           c.node_id,
           c.issued_date,
           c.expiry_date                                 as expiry,
           (c.expiry_date - current_date)                as days_left,
           c.status
    from public.employee_certifications c
    left join public.people    p on p.id = c.person_id
    left join public.org_nodes n on n.id = c.node_id
    where (p_node_ids is null or c.node_id = any(p_node_ids))
      and c.status <> 'expired'
      and (
        p_within_days is null
        or c.expiry_date is null
        or c.expiry_date <= current_date + (p_within_days || ' days')::interval
      )
  ) t;
$$;

create or replace function public.certification_upsert(
  p_id uuid, p_person_id uuid, p_node_id uuid, p_cert_name text,
  p_issued_date date, p_expiry_date date, p_status text,
  p_notes text, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if coalesce(length(trim(p_cert_name)), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'cert_name required');
  end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  if p_id is not null then
    update public.employee_certifications
       set person_id = coalesce(p_person_id, person_id),
           node_id   = coalesce(p_node_id, node_id),
           cert_name = trim(p_cert_name),
           issued_date = p_issued_date,
           expiry_date = p_expiry_date,
           status    = coalesce(nullif(trim(p_status), ''), status),
           notes     = p_notes,
           updated_at = now()
     where id = p_id
     returning id into v_id;
  else
    insert into public.employee_certifications
      (tenant_id, person_id, node_id, cert_name, issued_date, expiry_date, status, notes, created_by)
    values
      (v_tenant, p_person_id, p_node_id, trim(p_cert_name), p_issued_date, p_expiry_date,
       coalesce(nullif(trim(p_status), ''), 'active'), p_notes, p_actor)
    returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Mark a cert's renewal as scheduled (wired to the "Schedule Renewal" button).
create or replace function public.certification_schedule_renewal(
  p_id uuid, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.employee_certifications
     set status = 'renewal_scheduled', updated_at = now()
   where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Scheduled training drills ────────────────────────────────────────────────

create table if not exists public.training_drills (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  node_id      uuid,                              -- null → applies to all locations
  drill_name   text not null,
  drill_date   date,
  mandatory    boolean not null default false,
  status       text not null default 'scheduled',-- scheduled | completed | cancelled
  notes        text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists training_drills_date_idx
  on public.training_drills (drill_date);

alter table public.training_drills enable row level security;

-- Upcoming (or all) scheduled drills for a set of locations.
-- node_id null rows are company-wide and always included.
create or replace function public.get_training_drills(
  p_node_ids uuid[], p_from date default null
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.drill_date asc nulls last), '[]'::jsonb)
  from (
    select d.id,
           d.drill_name                              as name,
           d.drill_date                              as date,
           coalesce(n.name, 'All')                   as location,
           d.node_id,
           d.mandatory,
           d.status
    from public.training_drills d
    left join public.org_nodes n on n.id = d.node_id
    where (d.node_id is null or p_node_ids is null or d.node_id = any(p_node_ids))
      and d.status = 'scheduled'
      and (p_from is null or d.drill_date is null or d.drill_date >= p_from)
  ) t;
$$;

create or replace function public.training_drill_upsert(
  p_id uuid, p_node_id uuid, p_drill_name text, p_drill_date date,
  p_mandatory boolean, p_status text, p_notes text, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if coalesce(length(trim(p_drill_name)), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'drill_name required');
  end if;
  select tenant_id into v_tenant from public.org_nodes
    where p_node_id is not null and id = p_node_id limit 1;
  if v_tenant is null then
    select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;
  end if;
  if p_id is not null then
    update public.training_drills
       set node_id    = p_node_id,
           drill_name = trim(p_drill_name),
           drill_date = p_drill_date,
           mandatory  = coalesce(p_mandatory, mandatory),
           status     = coalesce(nullif(trim(p_status), ''), status),
           notes      = p_notes,
           updated_at = now()
     where id = p_id
     returning id into v_id;
  else
    insert into public.training_drills
      (tenant_id, node_id, drill_name, drill_date, mandatory, status, notes, created_by)
    values
      (v_tenant, p_node_id, trim(p_drill_name), p_drill_date,
       coalesce(p_mandatory, false), coalesce(nullif(trim(p_status), ''), 'scheduled'),
       p_notes, p_actor)
    returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── Grants (RPC-only access; tables stay RLS-locked) ─────────────────────────

grant execute on function public.get_expiring_certifications(uuid[], int)                              to anon, authenticated;
grant execute on function public.certification_upsert(uuid, uuid, uuid, text, date, date, text, text, uuid) to anon, authenticated;
grant execute on function public.certification_schedule_renewal(uuid, uuid)                            to anon, authenticated;
grant execute on function public.get_training_drills(uuid[], date)                                     to anon, authenticated;
grant execute on function public.training_drill_upsert(uuid, uuid, text, date, boolean, text, text, uuid) to anon, authenticated;
