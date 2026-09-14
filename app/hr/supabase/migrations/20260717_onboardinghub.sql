-- Onboarding Hub — real per-hire onboarding checklist store for
-- src/screens/OnboardingHub.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon policies — all
-- access is through SECURITY DEFINER RPCs granted to anon, authenticated.
--
-- What already exists and is REUSED (no duplication):
--   * onboarding_pipeline(p_node_ids uuid[])  -> live roster of new hires
--       (person_id, full_name, node_name, role, hired_at, days_in,
--        docs_signed, training_done, training_total). Drives the table + KPIs.
--   * get_job_applications(p_node_ids uuid[])  -> applicant_records in scope
--       (stage: applied/screening/interview/offer/hired/rejected). Drives the
--       Pipeline Snapshot funnel (real counts, no seeded numbers).
--
-- What was MISSING (and this migration adds): a persisted per-hire onboarding
-- checklist. The screen previously stored checklist state in localStorage
-- (fake datastore) keyed by employee id. This creates a real table keyed by the
-- pipeline's person_id, with who/when audit, plus read/bulk-read/upsert RPCs so
-- toggles and notes persist and reload honestly.

-- ── Table: one row per (person, checklist task) ─────────────────────────────
create table if not exists public.onboarding_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  person_id   uuid not null,
  task_id     text not null,
  done        boolean not null default false,
  done_at     timestamptz,
  done_by     uuid,
  note        text,
  updated_at  timestamptz not null default now(),
  unique (person_id, task_id)
);

create index if not exists onboarding_checklist_person_idx
  on public.onboarding_checklist_items (person_id);

alter table public.onboarding_checklist_items enable row level security;

-- ── Read: checklist for one hire, with the actor's display name ─────────────
create or replace function public.get_onboarding_checklist(
  p_person_id uuid
) returns table (
  task_id      text,
  done         boolean,
  done_at      timestamptz,
  done_by      uuid,
  done_by_name text,
  note         text
)
language sql security definer set search_path = public as $$
  select c.task_id, c.done, c.done_at, c.done_by,
         coalesce(p.display_name, p.full_name) as done_by_name,
         c.note
  from public.onboarding_checklist_items c
  left join public.people p on p.id = c.done_by
  where c.person_id = p_person_id;
$$;

-- ── Read (bulk): checklist for a whole roster in one round-trip ──────────────
create or replace function public.get_onboarding_checklist_bulk(
  p_person_ids uuid[]
) returns table (
  person_id    uuid,
  task_id      text,
  done         boolean,
  done_at      timestamptz,
  done_by      uuid,
  done_by_name text,
  note         text
)
language sql security definer set search_path = public as $$
  select c.person_id, c.task_id, c.done, c.done_at, c.done_by,
         coalesce(p.display_name, p.full_name) as done_by_name,
         c.note
  from public.onboarding_checklist_items c
  left join public.people p on p.id = c.done_by
  where p_person_ids is null
     or array_length(p_person_ids, 1) is null
     or c.person_id = any (p_person_ids);
$$;

-- ── Write: upsert one checklist item (toggle done and/or edit note) ─────────
-- The client passes the full intended state for the item (done + note), so a
-- note edit never clears the done flag and vice-versa. done_at / done_by are
-- stamped on completion and cleared when un-done.
create or replace function public.set_onboarding_checklist_item(
  p_person_id uuid,
  p_task_id   text,
  p_done      boolean,
  p_note      text  default null,
  p_actor     uuid  default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if p_person_id is null or p_task_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_key');
  end if;

  select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;

  insert into public.onboarding_checklist_items
    (tenant_id, person_id, task_id, done, done_at, done_by, note, updated_at)
  values (
    v_tenant, p_person_id, p_task_id, coalesce(p_done, false),
    case when p_done then now() else null end,
    case when p_done then p_actor else null end,
    p_note, now()
  )
  on conflict (person_id, task_id) do update
    set done       = excluded.done,
        done_at    = case when excluded.done
                            then coalesce(public.onboarding_checklist_items.done_at, now())
                          else null end,
        done_by    = case when excluded.done then excluded.done_by else null end,
        note       = excluded.note,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- ── Grants (RPC-only access; the table stays RLS-locked) ────────────────────
grant execute on function public.get_onboarding_checklist(uuid)                       to anon, authenticated;
grant execute on function public.get_onboarding_checklist_bulk(uuid[])                to anon, authenticated;
grant execute on function public.set_onboarding_checklist_item(uuid, text, boolean, text, uuid) to anon, authenticated;
