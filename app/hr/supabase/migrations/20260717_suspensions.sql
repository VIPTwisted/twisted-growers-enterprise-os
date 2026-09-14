-- ═══════════════════════════════════════════════════════════════════════════
-- Suspension Management — real backend for src/screens/Suspensions.jsx
--
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- The Suspensions screen previously ran entirely on hardcoded MOCK arrays plus a
-- deterministic seed() KPI generator, and its "Issue" / "Mark Returned" actions
-- only mutated React state (writes were silently discarded). Suspensions carry
-- fields the shared disciplinary_records table does not model (paid vs unpaid,
-- duration in days, computed return date, on-time return, witnessed_by, manager
-- notes, active/returned lifecycle), so a dedicated table + RPCs is the honest
-- fit. Related DA linkage is preserved as free text (related_da).
--
-- Idempotent: safe to run repeatedly. RLS enabled, NO anon table policies — all
-- access is through SECURITY DEFINER RPCs granted to anon, authenticated, exactly
-- like every other HR RPC (the app authenticates via pin_login under the anon role).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.employee_suspensions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid,
  node_id          uuid,
  person_id        uuid,
  susp_type        text not null default 'unpaid',   -- 'unpaid' | 'paid'
  start_date       date not null default current_date,
  duration_days    int  not null default 1,
  end_date         date,
  reason           text,
  related_da       text,
  witnessed_by     text,
  issued_by        uuid,
  manager_notes    text,
  status           text not null default 'active',   -- 'active' | 'returned'
  returned_at      date,
  returned_on_time boolean,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists employee_suspensions_node_idx
  on public.employee_suspensions (node_id, status, start_date desc);
create index if not exists employee_suspensions_person_idx
  on public.employee_suspensions (person_id);

alter table public.employee_suspensions enable row level security;

-- ── Read: every suspension in scope (active + history), enriched ─────────────
-- Returns a jsonb array. person_name / node_name resolved via joins; role_name is
-- enriched client-side from get_roster. Never invents values that aren't present.
create or replace function public.get_suspensions(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.start_date desc nulls last, t.created_at desc),
    '[]'::jsonb
  )
  from (
    select
      s.id,
      s.person_id,
      coalesce(p.full_name, '—')            as person_name,
      s.node_id,
      coalesce(n.name, '—')                 as node_name,
      s.susp_type,
      s.start_date,
      s.duration_days,
      s.end_date,
      s.reason,
      s.related_da,
      s.witnessed_by,
      s.issued_by,
      coalesce(iss.full_name, 'HR')         as issued_by_name,
      s.manager_notes,
      s.status,
      s.returned_at,
      s.returned_on_time,
      s.created_at
    from public.employee_suspensions s
    left join public.people    p   on p.id   = s.person_id
    left join public.org_nodes n   on n.id   = s.node_id
    left join public.people    iss on iss.id = s.issued_by
    where s.node_id = any(p_node_ids)
  ) t;
$$;

-- ── Write: issue a suspension ────────────────────────────────────────────────
create or replace function public.issue_suspension(
  p_person_id     uuid,
  p_node_id       uuid,
  p_type          text,
  p_start_date    date,
  p_duration_days int,
  p_reason        text,
  p_related_da    text default null,
  p_witnessed_by  text default null,
  p_issued_by     uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_dur    int := greatest(1, coalesce(p_duration_days, 1));
  v_start  date := coalesce(p_start_date, current_date);
  v_type   text := case when lower(coalesce(p_type,'')) like '%paid%'
                          and lower(coalesce(p_type,'')) not like '%unpaid%'
                        then 'paid' else 'unpaid' end;
  v_id     uuid;
begin
  if p_node_id is null then raise exception 'A location is required to issue a suspension'; end if;
  if p_person_id is null then raise exception 'An employee is required to issue a suspension'; end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  if v_tenant is null then raise exception 'Unknown node %', p_node_id; end if;

  insert into public.employee_suspensions(
    tenant_id, node_id, person_id, susp_type, start_date, duration_days, end_date,
    reason, related_da, witnessed_by, issued_by, status
  ) values (
    v_tenant, p_node_id, p_person_id, v_type, v_start, v_dur, v_start + v_dur,
    nullif(btrim(coalesce(p_reason,'')), ''),
    nullif(btrim(coalesce(p_related_da,'')), ''),
    nullif(btrim(coalesce(p_witnessed_by,'')), ''),
    p_issued_by, 'active'
  ) returning id into v_id;

  return v_id;
end; $$;

-- ── Write: mark returned ─────────────────────────────────────────────────────
create or replace function public.mark_suspension_returned(
  p_id    uuid,
  p_actor uuid default null,
  p_note  text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_end date;
begin
  select end_date into v_end from public.employee_suspensions where id = p_id;
  update public.employee_suspensions
     set status           = 'returned',
         returned_at       = current_date,
         returned_on_time  = (current_date <= coalesce(v_end, current_date)),
         manager_notes     = case when coalesce(btrim(p_note),'') <> ''
                                  then coalesce(manager_notes || E'\n', '') || p_note
                                  else manager_notes end,
         updated_at        = now()
   where id = p_id
   returning id into v_id;
  if v_id is null then raise exception 'Suspension % not found', p_id; end if;
  return v_id;
end; $$;

-- ── Write: save/replace manager notes on an active suspension ────────────────
create or replace function public.update_suspension_note(
  p_id   uuid,
  p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.employee_suspensions
     set manager_notes = nullif(btrim(coalesce(p_note,'')), ''),
         updated_at    = now()
   where id = p_id
   returning id into v_id;
  if v_id is null then raise exception 'Suspension % not found', p_id; end if;
  return v_id;
end; $$;

-- ── Grants — anon + authenticated, matching the pin_login/anon RPC model ──────
grant execute on function public.get_suspensions(uuid[]) to anon, authenticated;
grant execute on function public.issue_suspension(uuid,uuid,text,date,int,text,text,text,uuid) to anon, authenticated;
grant execute on function public.mark_suspension_returned(uuid,uuid,text) to anon, authenticated;
grant execute on function public.update_suspension_note(uuid,text) to anon, authenticated;
