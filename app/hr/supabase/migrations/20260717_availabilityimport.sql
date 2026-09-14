-- ============================================================================
-- AvailabilityImport screen backend (HR brain: zsmdejhgdyyaakqsjhmk)
-- ----------------------------------------------------------------------------
-- HARD RULE (business): HR imports each hire's availability from their JOB
-- APPLICATION. Employees never self-set it. This screen takes an applicant's
-- stated availability (free text), AI-parses it into a 7-day x AM/PM/EVE grid,
-- HR reviews/edits, and on approval it is locked to the applicant file.
--
-- Reuses the existing `applicant_records` table (recruiting pipeline). Applicants
-- are PRE-HIRE and have no person_id, so their reviewed availability cannot go
-- into `availability_prefs` (that is keyed by a hired person). We store the
-- imported/approved grid in a dedicated `applicant_availability` table keyed by
-- applicant_id; once the applicant is hired, HR pushes it into the live
-- availability system via the existing per-day save_availability RPC.
--
-- Idempotent. Security-definer RPCs, search_path pinned, granted to anon+auth.
-- ============================================================================

-- Stated availability text lives WITH the applicant (from their application).
alter table public.applicant_records
  add column if not exists availability_raw text;

-- Reviewed / approved availability import, one row per applicant.
create table if not exists public.applicant_availability (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid,
  applicant_id    uuid not null references public.applicant_records(id) on delete cascade,
  node_id         uuid,
  raw_text        text,
  grid            jsonb  not null default '{}'::jsonb,   -- { Monday:{AM,PM,EVE}, ... }
  preferred_shift text,
  notes           jsonb  not null default '[]'::jsonb,   -- array of parser notes
  approved        boolean not null default false,
  approved_by     text,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint applicant_availability_applicant_uniq unique (applicant_id)
);

create index if not exists applicant_availability_node_idx
  on public.applicant_availability (node_id);

alter table public.applicant_availability enable row level security;

-- ----------------------------------------------------------------------------
-- READ: applicants in scope + any reviewed availability import.
-- ----------------------------------------------------------------------------
create or replace function public.get_applicant_availability(p_node_ids uuid[] default null)
returns table (
  applicant_id    uuid,
  node_id         uuid,
  location        text,
  full_name       text,
  "position"      text,
  stage           text,
  applied_at      timestamptz,
  raw_text        text,
  grid            jsonb,
  preferred_shift text,
  notes           jsonb,
  approved        boolean,
  approved_by     text,
  approved_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    ar.id                                         as applicant_id,
    ar.node_id,
    onx.name                                      as location,
    ar.full_name,
    ar.position,
    ar.stage,
    ar.applied_at,
    coalesce(aa.raw_text, ar.availability_raw)    as raw_text,
    coalesce(aa.grid, '{}'::jsonb)                as grid,
    aa.preferred_shift,
    coalesce(aa.notes, '[]'::jsonb)               as notes,
    coalesce(aa.approved, false)                  as approved,
    aa.approved_by,
    aa.approved_at
  from public.applicant_records ar
  left join public.applicant_availability aa on aa.applicant_id = ar.id
  left join public.org_nodes onx on onx.id = ar.node_id
  where (p_node_ids is null or array_length(p_node_ids, 1) is null or ar.node_id = any(p_node_ids))
  order by ar.applied_at desc nulls last, ar.full_name asc;
$$;

-- ----------------------------------------------------------------------------
-- WRITE: upsert a reviewed availability import; optionally approve+lock it.
-- Also mirrors the raw text back onto the applicant record.
-- ----------------------------------------------------------------------------
create or replace function public.save_applicant_availability(
  p_applicant_id    uuid,
  p_raw             text    default null,
  p_grid            jsonb   default '{}'::jsonb,
  p_preferred_shift text    default null,
  p_notes           jsonb   default '[]'::jsonb,
  p_approved        boolean default false,
  p_approved_by     text    default null
)
returns public.applicant_availability
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_node   uuid;
  v_row    public.applicant_availability;
begin
  if p_applicant_id is null then
    raise exception 'applicant_id is required';
  end if;

  select tenant_id, node_id into v_tenant, v_node
  from public.applicant_records where id = p_applicant_id;

  if not found then
    raise exception 'applicant % not found', p_applicant_id;
  end if;

  -- keep the applicant's stated availability text with their record
  update public.applicant_records
     set availability_raw = coalesce(p_raw, availability_raw),
         updated_at = now()
   where id = p_applicant_id;

  insert into public.applicant_availability
    (tenant_id, applicant_id, node_id, raw_text, grid, preferred_shift, notes,
     approved, approved_by, approved_at, updated_at)
  values
    (v_tenant, p_applicant_id, v_node, p_raw, coalesce(p_grid, '{}'::jsonb),
     p_preferred_shift, coalesce(p_notes, '[]'::jsonb),
     coalesce(p_approved, false),
     case when p_approved then p_approved_by end,
     case when p_approved then now() end,
     now())
  on conflict (applicant_id) do update set
    raw_text        = excluded.raw_text,
    grid            = excluded.grid,
    preferred_shift = excluded.preferred_shift,
    notes           = excluded.notes,
    approved        = excluded.approved,
    approved_by     = case when excluded.approved then excluded.approved_by
                           else public.applicant_availability.approved_by end,
    approved_at     = case when excluded.approved then now()
                           else public.applicant_availability.approved_at end,
    updated_at      = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.get_applicant_availability(uuid[])   to anon, authenticated;
grant execute on function public.save_applicant_availability(uuid, text, jsonb, text, jsonb, boolean, text) to anon, authenticated;
