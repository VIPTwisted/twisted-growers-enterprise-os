-- Performance Reviews — real backend for src/screens/Reviews.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon table policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.
--
-- Context: the performance_reviews table already exists in this brain and is
-- read by the EXISTING get_performance_reviews RPC (consumed live by
-- EmployeeFile.jsx and AiAssist.jsx) with shape:
--   id, person_id, period, reviewer_name, created_at, overall_score,
--   scores(jsonb), notes(jsonb), status
-- The Reviews screen additionally needs employee_name / node_name / role_name /
-- reviewer_id / raise_rec / promo / pip / dispute_reason, and it needs a real
-- WRITE path (create_performance_review) — previously a phantom RPC that the
-- screen faked past with an "optimistic mock save".
--
-- This migration:
--   1) Additively guarantees every column the screen writes/reads exists
--      (ADD COLUMN IF NOT EXISTS — no-ops on the live table, correct on a
--      fresh one). It never changes an existing column's type.
--   2) Adds get_reviews_detailed(p_node_ids) — a superset read shaped for the
--      Reviews screen. The existing get_performance_reviews is left untouched
--      so EmployeeFile / AiAssist keep working.
--   3) Adds create_performance_review(...) — the real write. node_id/tenant_id
--      are derived server-side from the employee's active assignment (the
--      roster RPC does not expose node_id, so the client cannot supply it).
--   4) Replaces update_review_status(uuid,text,text) with a jsonb-safe body
--      that writes a real dispute_reason column instead of string-concatenating
--      onto the jsonb notes column.
--
-- Reused existing shapes: people(id, full_name), org_nodes(id, name, tenant_id),
-- roles(id, name), assignments(person_id, node_id, role_id, status,
-- effective_from). Employees come from the existing get_roster RPC.

-- ── Table (safety net — exists on the live brain) ────────────────────────────

create table if not exists public.performance_reviews (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid,
  node_id        uuid,
  person_id      uuid,
  reviewer_id    uuid,
  period         text,
  scores         jsonb  not null default '{}'::jsonb,
  overall_score  numeric not null default 0,
  notes          jsonb  not null default '{}'::jsonb,
  raise_rec      text   not null default 'none',
  promo          text   not null default 'not ready',
  pip            boolean not null default false,
  status         text   not null default 'draft',
  dispute_reason text,
  acknowledged_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Additive guarantees (no-ops where the column already exists) ────────────────
alter table public.performance_reviews add column if not exists tenant_id       uuid;
alter table public.performance_reviews add column if not exists node_id         uuid;
alter table public.performance_reviews add column if not exists person_id       uuid;
alter table public.performance_reviews add column if not exists reviewer_id     uuid;
alter table public.performance_reviews add column if not exists period          text;
alter table public.performance_reviews add column if not exists scores          jsonb   default '{}'::jsonb;
alter table public.performance_reviews add column if not exists overall_score   numeric default 0;
alter table public.performance_reviews add column if not exists notes           jsonb   default '{}'::jsonb;
alter table public.performance_reviews add column if not exists raise_rec       text    default 'none';
alter table public.performance_reviews add column if not exists promo           text    default 'not ready';
alter table public.performance_reviews add column if not exists pip             boolean default false;
alter table public.performance_reviews add column if not exists status          text    default 'draft';
alter table public.performance_reviews add column if not exists dispute_reason  text;
alter table public.performance_reviews add column if not exists acknowledged_at timestamptz;
alter table public.performance_reviews add column if not exists created_at      timestamptz default now();
alter table public.performance_reviews add column if not exists updated_at      timestamptz default now();

create index if not exists performance_reviews_person_idx on public.performance_reviews (person_id);
create index if not exists performance_reviews_node_idx   on public.performance_reviews (node_id);
create index if not exists performance_reviews_created_idx on public.performance_reviews (created_at desc);

alter table public.performance_reviews enable row level security;

-- ── Read: detailed reviews for the Reviews screen ────────────────────────────
-- Scoped like get_roster: a review is visible when the employee has an active
-- assignment in one of the requested nodes. This includes rows created before
-- node_id existed, and yields node_name / role_name from that assignment.

drop function if exists public.get_reviews_detailed(uuid[]);
create function public.get_reviews_detailed(p_node_ids uuid[])
returns table (
  id             uuid,
  person_id      uuid,
  employee_name  text,
  node_name      text,
  role_name      text,
  reviewer_id    uuid,
  reviewer_name  text,
  period         text,
  scores         jsonb,
  overall_score  numeric,
  status         text,
  created_at     timestamptz,
  notes          jsonb,
  raise_rec      text,
  promo          text,
  pip            boolean,
  dispute_reason text
)
language sql stable security definer set search_path to 'public' as $$
  select distinct on (pr.id)
    pr.id,
    pr.person_id,
    emp.full_name                          as employee_name,
    n.name                                 as node_name,
    r.name                                 as role_name,
    pr.reviewer_id,
    coalesce(rev.full_name, 'HR')          as reviewer_name,
    pr.period,
    coalesce(pr.scores, '{}'::jsonb)       as scores,
    coalesce(pr.overall_score, 0)          as overall_score,
    coalesce(pr.status, 'draft')           as status,
    pr.created_at,
    coalesce(pr.notes, '{}'::jsonb)        as notes,
    coalesce(pr.raise_rec, 'none')         as raise_rec,
    coalesce(pr.promo, 'not ready')        as promo,
    coalesce(pr.pip, false)                as pip,
    pr.dispute_reason
  from performance_reviews pr
  join people emp on emp.id = pr.person_id
  join assignments a
    on a.person_id = pr.person_id
   and a.status = 'active'
   and a.node_id = any(p_node_ids)
  join org_nodes n on n.id = a.node_id
  left join roles r on r.id = a.role_id
  left join people rev on rev.id = pr.reviewer_id
  order by pr.id, a.effective_from desc;
$$;
grant execute on function public.get_reviews_detailed(uuid[]) to anon, authenticated;

-- ── Write: create a performance review ───────────────────────────────────────
-- node_id + tenant_id are derived from the employee's most recent active
-- assignment; the client cannot supply node_id (roster RPC doesn't expose it).

drop function if exists public.create_performance_review(uuid, uuid, text, jsonb, numeric, jsonb, text, text, boolean, text);
create function public.create_performance_review(
  p_person_id     uuid,
  p_reviewer_id   uuid,
  p_period        text,
  p_scores        jsonb,
  p_overall_score numeric,
  p_notes         jsonb,
  p_raise_rec     text,
  p_promo         text,
  p_pip           boolean,
  p_status        text
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_node_id   uuid;
  v_tenant_id uuid;
  v_id        uuid;
begin
  if p_person_id is null then
    raise exception 'Employee is required';
  end if;

  select a.node_id, n.tenant_id
    into v_node_id, v_tenant_id
  from assignments a
  join org_nodes n on n.id = a.node_id
  where a.person_id = p_person_id and a.status = 'active'
  order by a.effective_from desc
  limit 1;

  if v_node_id is null then
    raise exception 'No active assignment found for employee %', p_person_id;
  end if;

  insert into public.performance_reviews(
    tenant_id, node_id, person_id, reviewer_id, period, scores, overall_score,
    notes, raise_rec, promo, pip, status
  ) values (
    v_tenant_id, v_node_id, p_person_id, p_reviewer_id,
    coalesce(nullif(p_period, ''), 'Review'),
    coalesce(p_scores, '{}'::jsonb),
    coalesce(p_overall_score, 0),
    coalesce(p_notes, '{}'::jsonb),
    coalesce(nullif(p_raise_rec, ''), 'none'),
    coalesce(nullif(p_promo, ''), 'not ready'),
    coalesce(p_pip, false),
    coalesce(nullif(p_status, ''), 'draft')
  ) returning id into v_id;

  return v_id;
end; $$;
grant execute on function public.create_performance_review(uuid, uuid, text, jsonb, numeric, jsonb, text, text, boolean, text) to anon, authenticated;

-- ── Write: acknowledge / dispute (jsonb-safe replacement) ────────────────────
-- Same signature the client already calls. Writes a real dispute_reason column
-- rather than string-concatenating onto the jsonb notes column.

create or replace function public.update_review_status(
  p_review_id uuid, p_status text, p_dispute_reason text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  update performance_reviews
     set status = coalesce(nullif(p_status, ''), status),
         acknowledged_at = case when p_status = 'acknowledged' then now() else acknowledged_at end,
         dispute_reason  = case when coalesce(p_dispute_reason, '') <> '' then p_dispute_reason else dispute_reason end,
         updated_at = now()
   where id = p_review_id
   returning id into v_id;
  if v_id is null then
    raise exception 'Review % not found', p_review_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.update_review_status(uuid, text, text) to anon, authenticated;
