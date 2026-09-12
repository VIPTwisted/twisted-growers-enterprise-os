-- Incident Management — real backend for src/screens/Incidents.jsx.
-- HR brain project: zsmdejhgdyyaakqsjhmk.
--
-- The base `incidents` table + thin create_incident/update_incident RPCs already
-- exist (wired in 20260715050856_wire_top_harm_hr_rpcs.sql) and are shared by
-- Cockpit / CommandCenter / IncidentsBoard / HRInvestigations / AiAssist. This
-- migration is PURELY ADDITIVE: it grows that same table with the forensic
-- columns the Incidents screen captures, and adds richer read/write RPCs
-- (get_incidents_full / create_incident_full / update_incident_full /
-- incident_set_checklist) so nothing existing changes shape or breaks.
--
-- Idempotent: safe to run repeatedly. RLS stays enabled; access is only through
-- SECURITY DEFINER functions granted to anon, authenticated (app auth = pin_login
-- → anon role).

-- ── Table (safety net if the brain is fresh) ────────────────────────────────
create table if not exists public.incidents (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  node_id      uuid not null,
  reported_by  uuid,
  date         date not null default current_date,
  type         text,
  severity     text,
  description  text,
  status       text not null default 'open',
  follow_up    text,
  updated_at   timestamptz not null default now()
);

-- ── Additive forensic columns (never destructive) ───────────────────────────
alter table public.incidents add column if not exists incident_number      text;
alter table public.incidents add column if not exists reporter_name        text;
alter table public.incidents add column if not exists occurred_at          timestamptz;
alter table public.incidents add column if not exists summary              text;
alter table public.incidents add column if not exists location_text        text;
alter table public.incidents add column if not exists employees_involved   jsonb   default '[]'::jsonb;
alter table public.incidents add column if not exists witnesses            text;
alter table public.incidents add column if not exists customer_involved    boolean default false;
alter table public.incidents add column if not exists customer_name        text;
alter table public.incidents add column if not exists customer_contact     text;
alter table public.incidents add column if not exists police_called        boolean default false;
alter table public.incidents add column if not exists police_report_num    text;
alter table public.incidents add column if not exists estimated_loss       numeric default 0;
alter table public.incidents add column if not exists immediate_action     text;
alter table public.incidents add column if not exists follow_up_required   boolean default false;
alter table public.incidents add column if not exists notify_hr            boolean default false;
alter table public.incidents add column if not exists investigation_notes  text;
alter table public.incidents add column if not exists assigned_investigator text;
alter table public.incidents add column if not exists escalated            boolean default false;
alter table public.incidents add column if not exists timeline             jsonb   default '[]'::jsonb;
alter table public.incidents add column if not exists checklist            jsonb   default '{}'::jsonb;
alter table public.incidents add column if not exists created_at           timestamptz not null default now();

create index if not exists incidents_node_date_idx on public.incidents (node_id, date desc);
create index if not exists incidents_status_idx     on public.incidents (status);

create sequence if not exists public.incidents_number_seq;

alter table public.incidents enable row level security;

-- ── Shared row-shaper ───────────────────────────────────────────────────────
-- One authoritative projection of an incident row into the exact object the
-- screen consumes. Existing thin rows (no forensic columns) degrade honestly:
-- summary <- description, incident_number <- id prefix, arrays <- empty.
create or replace function public._incident_row(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',                    i.id::text,
    'incident_number',       coalesce(nullif(i.incident_number,''), 'INC-' || upper(substr(i.id::text, 1, 8))),
    'date',                  coalesce(i.occurred_at, i.date::timestamptz, i.created_at),
    'node_id',               i.node_id,
    'location',              coalesce(n.name, nullif(i.location_text,''), '—'),
    'type',                  coalesce(nullif(i.type,''), 'Other'),
    'severity',              coalesce(nullif(i.severity,''), 'Medium'),
    'status',                coalesce(nullif(i.status,''), 'open'),
    'summary',               coalesce(nullif(i.summary,''), i.description, ''),
    'reported_by',           coalesce(nullif(i.reporter_name,''), p.full_name, '—'),
    'reported_by_id',        i.reported_by,
    'employees_involved',    coalesce(i.employees_involved, '[]'::jsonb),
    'witnesses',             coalesce(i.witnesses, ''),
    'customer_involved',     coalesce(i.customer_involved, false),
    'customer_name',         coalesce(i.customer_name, ''),
    'customer_contact',      coalesce(i.customer_contact, ''),
    'police_called',         coalesce(i.police_called, false),
    'police_report_num',     coalesce(i.police_report_num, ''),
    'estimated_loss',        coalesce(i.estimated_loss, 0),
    'immediate_action',      coalesce(i.immediate_action, ''),
    'follow_up',             coalesce(i.follow_up_required, false),
    'notify_hr',             coalesce(i.notify_hr, false),
    'investigation_notes',   coalesce(i.investigation_notes, ''),
    'assigned_investigator', coalesce(i.assigned_investigator, ''),
    'escalated',             coalesce(i.escalated, false),
    'timeline',              coalesce(i.timeline, '[]'::jsonb),
    'checklist',             coalesce(i.checklist, '{}'::jsonb)
  )
  from public.incidents i
  left join public.org_nodes n on n.id = i.node_id
  left join public.people    p on p.id = i.reported_by
  where i.id = p_id;
$$;

-- ── Read: every incident for the caller's locations, newest first ───────────
create or replace function public.get_incidents_full(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(r.obj order by (r.obj->>'date') desc nulls last), '[]'::jsonb)
  from (
    select public._incident_row(i.id) as obj
    from public.incidents i
    where i.node_id = any(p_node_ids)
  ) r;
$$;

-- ── Write: file a new incident (full forensic form) ─────────────────────────
create or replace function public.create_incident_full(
  p_node_id            uuid,
  p_type               text,
  p_severity           text,
  p_incident_date      date,
  p_occurred_time      text,
  p_description        text,
  p_reported_by        uuid,
  p_reporter_name      text,
  p_employees_involved jsonb,
  p_witnesses          text,
  p_customer_involved  boolean,
  p_customer_name      text,
  p_customer_contact   text,
  p_police_called      boolean,
  p_police_report_num  text,
  p_estimated_loss     numeric,
  p_immediate_action   text,
  p_follow_up          boolean,
  p_notify_hr          boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_id     uuid;
  v_num    text;
  v_actor  text := coalesce(nullif(p_reporter_name, ''), 'Staff');
  v_occ    timestamptz;
begin
  if p_node_id is null then
    raise exception 'A location is required to file an incident.';
  end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  if v_tenant is null then
    raise exception 'Unknown location %', p_node_id;
  end if;
  if coalesce(trim(p_description), '') = '' then
    raise exception 'Description is required.';
  end if;

  v_num := 'INC-' || lpad(nextval('public.incidents_number_seq')::text, 5, '0');
  v_occ := case
             when p_incident_date is not null
               then (p_incident_date::text || ' ' || coalesce(nullif(p_occurred_time, ''), '12:00'))::timestamptz
             else now()
           end;

  insert into public.incidents (
    tenant_id, node_id, reported_by, reporter_name, date, occurred_at, type, severity,
    description, summary, status, incident_number, employees_involved, witnesses,
    customer_involved, customer_name, customer_contact, police_called, police_report_num,
    estimated_loss, immediate_action, follow_up_required, notify_hr, investigation_notes,
    assigned_investigator, escalated, timeline, checklist, created_at, updated_at
  ) values (
    v_tenant, p_node_id, p_reported_by, nullif(p_reporter_name, ''),
    coalesce(p_incident_date, current_date), v_occ,
    coalesce(nullif(p_type, ''), 'Other'), coalesce(nullif(p_severity, ''), 'Medium'),
    p_description, p_description, 'open', v_num,
    coalesce(p_employees_involved, '[]'::jsonb), nullif(p_witnesses, ''),
    coalesce(p_customer_involved, false), nullif(p_customer_name, ''), nullif(p_customer_contact, ''),
    coalesce(p_police_called, false), nullif(p_police_report_num, ''),
    coalesce(p_estimated_loss, 0), nullif(p_immediate_action, ''),
    coalesce(p_follow_up, false), coalesce(p_notify_hr, false), '', '', false,
    jsonb_build_array(jsonb_build_object('ts', now(), 'actor', v_actor, 'note', 'Incident filed.')),
    '{}'::jsonb, now(), now()
  ) returning id into v_id;

  return public._incident_row(v_id);
end;
$$;

-- ── Write: update status / notes / escalate (appends timeline) ──────────────
create or replace function public.update_incident_full(
  p_incident_id uuid,
  p_status      text    default null,   -- set status when provided
  p_notes       text    default null,   -- replace investigation_notes when provided
  p_note        text    default null,   -- append a freeform timeline note
  p_escalate    boolean default false,  -- flag + timeline entry
  p_actor       text    default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_actor  text  := coalesce(nullif(p_actor, ''), 'Staff');
  v_events jsonb := '[]'::jsonb;
begin
  if p_status is not null and p_status <> '' then
    v_events := v_events || jsonb_build_array(
      jsonb_build_object('ts', now(), 'actor', v_actor, 'note', 'Status set to ' || p_status));
  end if;
  if p_escalate then
    v_events := v_events || jsonb_build_array(
      jsonb_build_object('ts', now(), 'actor', v_actor, 'note', 'Escalated to management.'));
  end if;
  if p_note is not null and p_note <> '' then
    v_events := v_events || jsonb_build_array(
      jsonb_build_object('ts', now(), 'actor', v_actor, 'note', p_note));
  end if;

  update public.incidents
     set status              = coalesce(nullif(p_status, ''), status),
         investigation_notes = coalesce(p_notes, investigation_notes),
         escalated           = case when p_escalate then true else escalated end,
         timeline            = coalesce(timeline, '[]'::jsonb) || v_events,
         updated_at          = now()
   where id = p_incident_id
   returning id into v_id;

  if v_id is null then
    raise exception 'Incident % not found', p_incident_id;
  end if;
  return public._incident_row(v_id);
end;
$$;

-- ── Write: persist investigation checklist ──────────────────────────────────
create or replace function public.incident_set_checklist(
  p_incident_id uuid,
  p_checklist   jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.incidents
     set checklist  = coalesce(p_checklist, '{}'::jsonb),
         updated_at = now()
   where id = p_incident_id
   returning id into v_id;
  if v_id is null then
    raise exception 'Incident % not found', p_incident_id;
  end if;
  return public._incident_row(v_id);
end;
$$;

-- ── Grants (RPC-only access; table stays RLS-locked) ────────────────────────
grant execute on function public._incident_row(uuid)                                     to anon, authenticated;
grant execute on function public.get_incidents_full(uuid[])                              to anon, authenticated;
grant execute on function public.create_incident_full(
  uuid, text, text, date, text, text, uuid, text, jsonb, text, boolean, text, text,
  boolean, text, numeric, text, boolean, boolean)                                        to anon, authenticated;
grant execute on function public.update_incident_full(uuid, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.incident_set_checklist(uuid, jsonb)                     to anon, authenticated;
