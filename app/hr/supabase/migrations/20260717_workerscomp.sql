-- ============================================================================
-- Workers Compensation — real backend for src/screens/WorkersComp.jsx
-- ----------------------------------------------------------------------------
-- HR brain project: zsmdejhgdyyaakqsjhmk.
--
-- The WorkersComp screen previously rendered a seed()-generated MOCK_INCIDENTS_WC
-- array and mutated it in React state only (writes lost on refresh). Workers-comp
-- claims carry fields that the generic `incidents` table does not model
-- (body part, medical attention level, OSHA-recordable flag, insurance-reported
-- flag, claim number, running case-note log), so this migration introduces a
-- dedicated `workers_comp_claims` table plus read/write RPCs — mirroring the
-- shape and discipline of 20260717_incidents.sql.
--
-- Idempotent: safe to run repeatedly. RLS is enabled; the table is reached ONLY
-- through SECURITY DEFINER functions granted to anon, authenticated (the HR app
-- authenticates via pin_login and calls RPCs as the anon role).
-- ============================================================================

-- ── Table ───────────────────────────────────────────────────────────────────
create table if not exists public.workers_comp_claims (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid,
  node_id                uuid not null,
  claim_number           text,
  person_id              uuid,
  employee_name          text,
  reported_by            uuid,
  reporter_name          text,
  incident_date          date not null default current_date,
  occurred_at            timestamptz,
  type                   text,
  body_part              text,
  description            text,
  medical_attention      text,
  witnesses              text,
  osha_recordable        boolean not null default false,
  reported_to_insurance  boolean not null default false,
  status                 text    not null default 'OPEN',
  notes                  jsonb   not null default '[]'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists wc_claims_node_date_idx on public.workers_comp_claims (node_id, incident_date desc);
create index if not exists wc_claims_status_idx     on public.workers_comp_claims (status);

create sequence if not exists public.workers_comp_claim_seq;

alter table public.workers_comp_claims enable row level security;

-- ── Shared row-shaper ───────────────────────────────────────────────────────
-- One authoritative projection into the exact object the screen consumes
-- (camelCase keys). Employee/location names resolve from people + org_nodes,
-- degrading to the stored free-text fallback and finally an em-dash.
create or replace function public._wc_claim_row(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',                    c.id::text,
    'claimNum',              coalesce(nullif(c.claim_number, ''), 'CLM-' || upper(substr(c.id::text, 1, 8))),
    'employee',              coalesce(p.full_name, nullif(c.employee_name, ''), '—'),
    'personId',              c.person_id,
    'nodeId',                c.node_id,
    'location',              coalesce(n.name, '—'),
    'date',                  coalesce(c.occurred_at, c.incident_date::timestamptz, c.created_at),
    'type',                  coalesce(nullif(c.type, ''), 'Other'),
    'bodyPart',              coalesce(nullif(c.body_part, ''), '—'),
    'description',           coalesce(c.description, ''),
    'medicalAttention',      coalesce(nullif(c.medical_attention, ''), 'None'),
    'witnesses',             coalesce(c.witnesses, ''),
    'oshaRecordable',        coalesce(c.osha_recordable, false),
    'reportedToInsurance',   coalesce(c.reported_to_insurance, false),
    'status',                coalesce(nullif(c.status, ''), 'OPEN'),
    'reportedBy',            coalesce(nullif(c.reporter_name, ''), rp.full_name, '—'),
    'notes',                 coalesce(c.notes, '[]'::jsonb)
  )
  from public.workers_comp_claims c
  left join public.org_nodes n  on n.id = c.node_id
  left join public.people    p  on p.id = c.person_id
  left join public.people    rp on rp.id = c.reported_by
  where c.id = p_id;
$$;

-- ── Read: every claim for the caller's locations, newest first ──────────────
create or replace function public.get_workers_comp_claims(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(r.obj order by (r.obj->>'date') desc nulls last), '[]'::jsonb)
  from (
    select public._wc_claim_row(c.id) as obj
    from public.workers_comp_claims c
    where p_node_ids is null or c.node_id = any(p_node_ids)
  ) r;
$$;

-- ── Write: log a new workers-comp claim ─────────────────────────────────────
create or replace function public.create_workers_comp_claim(
  p_node_id               uuid,
  p_person_id             uuid,
  p_employee_name         text,
  p_incident_date         date,
  p_occurred_time         text,
  p_type                  text,
  p_body_part             text,
  p_description           text,
  p_medical_attention     text,
  p_witnesses             text,
  p_osha_recordable       boolean,
  p_reported_to_insurance boolean,
  p_reported_by           uuid,
  p_reporter_name         text
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
    raise exception 'A location is required to log a workers-comp claim.';
  end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  if v_tenant is null then
    raise exception 'Unknown location %', p_node_id;
  end if;
  if coalesce(trim(p_description), '') = '' then
    raise exception 'Description is required.';
  end if;

  v_num := 'CLM-' || to_char(coalesce(p_incident_date, current_date), 'YYYY')
           || '-' || lpad(nextval('public.workers_comp_claim_seq')::text, 4, '0');
  v_occ := case
             when p_incident_date is not null
               then (p_incident_date::text || ' ' || coalesce(nullif(p_occurred_time, ''), '12:00'))::timestamptz
             else now()
           end;

  insert into public.workers_comp_claims (
    tenant_id, node_id, claim_number, person_id, employee_name, reported_by, reporter_name,
    incident_date, occurred_at, type, body_part, description, medical_attention, witnesses,
    osha_recordable, reported_to_insurance, status, notes, created_at, updated_at
  ) values (
    v_tenant, p_node_id, v_num, p_person_id, nullif(p_employee_name, ''), p_reported_by, nullif(p_reporter_name, ''),
    coalesce(p_incident_date, current_date), v_occ,
    coalesce(nullif(p_type, ''), 'Other'), coalesce(nullif(p_body_part, ''), '—'),
    p_description, coalesce(nullif(p_medical_attention, ''), 'None'), nullif(p_witnesses, ''),
    coalesce(p_osha_recordable, false), coalesce(p_reported_to_insurance, false), 'OPEN',
    jsonb_build_array(jsonb_build_object('ts', now(), 'actor', v_actor, 'note', 'Incident logged.')),
    now(), now()
  ) returning id into v_id;

  return public._wc_claim_row(v_id);
end;
$$;

-- ── Write: update status and/or append a case note ──────────────────────────
create or replace function public.update_workers_comp_claim(
  p_claim_id uuid,
  p_status   text default null,   -- set status when provided (OPEN / CLOSED / PENDING REVIEW)
  p_note     text default null,   -- append a case note when provided
  p_actor    text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_actor  text  := coalesce(nullif(p_actor, ''), 'Staff');
  v_events jsonb := '[]'::jsonb;
begin
  if p_note is not null and p_note <> '' then
    v_events := v_events || jsonb_build_array(
      jsonb_build_object('ts', now(), 'actor', v_actor, 'note', p_note));
  end if;
  if p_status is not null and p_status <> '' then
    v_events := v_events || jsonb_build_array(
      jsonb_build_object('ts', now(), 'actor', v_actor, 'note', 'Status set to ' || upper(p_status) || '.'));
  end if;

  update public.workers_comp_claims
     set status     = coalesce(nullif(p_status, ''), status),
         notes      = coalesce(notes, '[]'::jsonb) || v_events,
         updated_at = now()
   where id = p_claim_id
   returning id into v_id;

  if v_id is null then
    raise exception 'Workers-comp claim % not found', p_claim_id;
  end if;
  return public._wc_claim_row(v_id);
end;
$$;

-- ── Grants (RPC-only access; table stays RLS-locked) ────────────────────────
grant execute on function public._wc_claim_row(uuid)              to anon, authenticated;
grant execute on function public.get_workers_comp_claims(uuid[])  to anon, authenticated;
grant execute on function public.create_workers_comp_claim(
  uuid, uuid, text, date, text, text, text, text, text, text, boolean, boolean, uuid, text)
                                                                  to anon, authenticated;
grant execute on function public.update_workers_comp_claim(uuid, text, text, text) to anon, authenticated;
