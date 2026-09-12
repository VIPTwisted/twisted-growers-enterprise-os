-- Shift Bookends — store opening & closing PROCEDURE checklists (per location,
-- per day, per bookend type) for src/screens/ShiftBookends.jsx.
-- HR brain project: zsmdejhgdyyaakqsjhmk.
--
-- NOTE: the pre-existing public.shift_bookends table (id, shift_id, type,
-- opened_by, opened_at, closed_at) records open/close EVENTS against an
-- individual scheduled shift row. It cannot represent this screen's model:
-- a location-level, date-level opening/closing procedure checklist with
-- per-item completion, completion %, manager notes / sign-off and a rolling
-- history. So we add a purpose-built table + SECURITY DEFINER RPCs here and
-- leave the existing shift_bookends table untouched.
--
-- Idempotent: safe to run repeatedly. RLS enabled, no anon policies — all
-- access is through SECURITY DEFINER RPCs granted to anon, authenticated.

-- ── Table ────────────────────────────────────────────────────────────────────
-- One row per (location, date, bookend type). The per-item checkbox map is
-- stored in checked_items jsonb exactly as the screen shapes it; completion,
-- sign-off and notes are lifted into columns for scoping, filtering and KPIs.

create table if not exists public.shift_bookend_checklists (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid,
  node_id         uuid not null references public.org_nodes(id),
  checklist_date  date not null default current_date,
  bookend_type    text not null check (bookend_type in ('OPEN', 'CLOSE')),
  status          text not null default 'in_progress'
                    check (status in ('in_progress', 'submitted', 'locked')),
  completion_pct  int  not null default 0,
  items_done      int  not null default 0,
  items_total     int  not null default 0,
  checked_items   jsonb not null default '{}'::jsonb,
  signed_by       text,
  notes           text,
  author_name     text,
  author_id       uuid,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (node_id, checklist_date, bookend_type)
);

create index if not exists shift_bookend_checklists_node_date_idx
  on public.shift_bookend_checklists (node_id, checklist_date desc);
create index if not exists shift_bookend_checklists_status_idx
  on public.shift_bookend_checklists (status);

alter table public.shift_bookend_checklists enable row level security;

-- ── Read: today's live state for the selected location(s) ────────────────────
-- Returns the current OPEN and CLOSE checklist rows so the screen restores the
-- checkbox state, completion, sign-off and lock status from the database
-- (no localStorage as a datastore).

create or replace function public.get_bookend_today(
  p_node_ids uuid[],
  p_date     date default current_date
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',            c.id::text,
      'node_id',       c.node_id,
      'location',      n.name,
      'date',          c.checklist_date,
      'bookendType',   c.bookend_type,
      'status',        c.status,
      'completionPct', c.completion_pct,
      'itemsDone',     c.items_done,
      'itemsTotal',    c.items_total,
      'checkedItems',  c.checked_items,
      'signedBy',      c.signed_by,
      'notes',         c.notes,
      'authorName',    c.author_name,
      'submittedAt',   c.submitted_at,
      'updatedAt',     c.updated_at
    )
  ), '[]'::jsonb)
  from public.shift_bookend_checklists c
  left join public.org_nodes n on n.id = c.node_id
  where c.node_id = any(p_node_ids)
    and c.checklist_date = p_date;
$$;

-- ── Read: rolling history (default last 14 days) ─────────────────────────────
-- Feeds the History tab, KPI strip and drill-downs. Only completed
-- (submitted / locked) checklists count as history rows.

create or replace function public.get_bookend_checklists(
  p_node_ids uuid[],
  p_days     int default 14
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',            c.id::text,
      'node_id',       c.node_id,
      'location',      n.name,
      'date',          c.checklist_date,
      'shift',         case when c.bookend_type = 'OPEN' then 'Open' else 'Close' end,
      'bookendType',   c.bookend_type,
      'openedBy',      coalesce(nullif(c.signed_by, ''), c.author_name, '—'),
      'completionPct', c.completion_pct,
      'issuesNoted',   coalesce(c.notes, ''),
      'status',        c.status,
      'submittedAt',   c.submitted_at
    )
    order by c.checklist_date desc, c.bookend_type
  ), '[]'::jsonb)
  from public.shift_bookend_checklists c
  left join public.org_nodes n on n.id = c.node_id
  where c.node_id = any(p_node_ids)
    and c.status in ('submitted', 'locked')
    and c.checklist_date >= (current_date - make_interval(days => greatest(p_days, 1)));
$$;

-- ── Write: upsert a checklist (progress, submit or lock) ─────────────────────
-- One authoritative row per (node, date, type). p_status:
--   'in_progress' -> autosave while the manager works the list
--   'submitted'   -> opening signed off (stamps submitted_at once)
--   'locked'      -> closing signed off & locked
-- Returns the saved row in the same shape get_bookend_today emits.

create or replace function public.bookend_checklist_upsert(
  p_node_id        uuid,
  p_type           text,
  p_date           date,
  p_checked_items  jsonb,
  p_completion_pct int,
  p_items_done     int,
  p_items_total    int,
  p_signed_by      text,
  p_notes          text,
  p_status         text,
  p_author         text,
  p_author_id      uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_type   text := upper(coalesce(nullif(p_type, ''), 'OPEN'));
  v_status text := coalesce(nullif(p_status, ''), 'in_progress');
  v_date   date := coalesce(p_date, current_date);
  v_id     uuid;
begin
  if p_node_id is null then
    raise exception 'node_id (location) is required';
  end if;
  if v_type not in ('OPEN', 'CLOSE') then
    raise exception 'bookend type must be OPEN or CLOSE';
  end if;
  if v_status not in ('in_progress', 'submitted', 'locked') then
    raise exception 'invalid status %', v_status;
  end if;

  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;

  insert into public.shift_bookend_checklists as t
    (tenant_id, node_id, checklist_date, bookend_type, status,
     completion_pct, items_done, items_total, checked_items,
     signed_by, notes, author_name, author_id, submitted_at)
  values
    (v_tenant, p_node_id, v_date, v_type, v_status,
     coalesce(p_completion_pct, 0), coalesce(p_items_done, 0), coalesce(p_items_total, 0),
     coalesce(p_checked_items, '{}'::jsonb),
     nullif(p_signed_by, ''), nullif(p_notes, ''), p_author, p_author_id,
     case when v_status in ('submitted', 'locked') then now() else null end)
  on conflict (node_id, checklist_date, bookend_type) do update
    set status         = excluded.status,
        completion_pct = excluded.completion_pct,
        items_done     = excluded.items_done,
        items_total    = excluded.items_total,
        checked_items  = excluded.checked_items,
        signed_by      = coalesce(excluded.signed_by, t.signed_by),
        notes          = coalesce(excluded.notes, t.notes),
        author_name    = coalesce(excluded.author_name, t.author_name),
        author_id      = coalesce(excluded.author_id, t.author_id),
        submitted_at   = case when excluded.status in ('submitted', 'locked')
                              then coalesce(t.submitted_at, now())
                              else t.submitted_at end,
        updated_at     = now()
  returning t.id into v_id;

  return (
    select jsonb_build_object(
      'id',            c.id::text,
      'node_id',       c.node_id,
      'location',      n.name,
      'date',          c.checklist_date,
      'bookendType',   c.bookend_type,
      'status',        c.status,
      'completionPct', c.completion_pct,
      'itemsDone',     c.items_done,
      'itemsTotal',    c.items_total,
      'checkedItems',  c.checked_items,
      'signedBy',      c.signed_by,
      'notes',         c.notes,
      'authorName',    c.author_name,
      'submittedAt',   c.submitted_at,
      'updatedAt',     c.updated_at
    )
    from public.shift_bookend_checklists c
    left join public.org_nodes n on n.id = c.node_id
    where c.id = v_id
  );
end;
$$;

-- ── Write: reset a checklist for the next shift ──────────────────────────────
-- Clears the current (node, date, type) row so the screen starts fresh.
-- Prior days' history is untouched.

create or replace function public.bookend_checklist_reset(
  p_node_id uuid,
  p_type    text,
  p_date    date default current_date
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_node_id is null then
    raise exception 'node_id (location) is required';
  end if;
  delete from public.shift_bookend_checklists
   where node_id = p_node_id
     and checklist_date = coalesce(p_date, current_date)
     and bookend_type = upper(coalesce(nullif(p_type, ''), 'OPEN'));
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Grants (RPC-only access; table stays RLS-locked) ─────────────────────────

grant execute on function public.get_bookend_today(uuid[], date)              to anon, authenticated;
grant execute on function public.get_bookend_checklists(uuid[], int)          to anon, authenticated;
grant execute on function public.bookend_checklist_upsert(uuid, text, date, jsonb, int, int, int, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.bookend_checklist_reset(uuid, text, date)    to anon, authenticated;
