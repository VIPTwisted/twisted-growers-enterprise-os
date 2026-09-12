-- Shift Manager Notes — real backend for src/screens/ShiftNotes.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.shift_notes (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid,
  node_id             uuid not null,
  note_date           date not null default current_date,
  shift               text not null,                       -- 'AM' | 'PM'
  summary             text not null,
  tagged              jsonb not null default '[]'::jsonb,  -- [{id, name}]
  note_type           text not null default 'general',     -- recognition|concern|incident|general
  is_private          boolean not null default false,
  follow_up_required  boolean not null default false,
  follow_up_note      text,
  photo               text,
  manager_name        text,
  manager_id          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists shift_notes_node_date_idx on public.shift_notes (node_id, note_date desc);

alter table public.shift_notes enable row level security;

-- ── Read ─────────────────────────────────────────────────────────────────────
-- Named get_* so the client rpc-wrapper stays quiet if not yet deployed.
create or replace function public.get_shift_notes(
  p_node_ids uuid[], p_limit int default 500
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.note_date desc, t.created_at desc), '[]'::jsonb)
  from (
    select s.id, s.node_id, n.name as node_name, s.note_date, s.shift, s.summary,
           s.tagged, s.note_type, s.is_private, s.follow_up_required,
           s.follow_up_note, s.photo, s.manager_name, s.manager_id, s.created_at
    from public.shift_notes s
    left join public.org_nodes n on n.id = s.node_id
    where s.node_id = any(p_node_ids)
    order by s.note_date desc, s.created_at desc
    limit greatest(coalesce(p_limit, 500), 1)
  ) t;
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

create or replace function public.shift_note_create(
  p_node_id uuid, p_note_date date, p_shift text, p_summary text,
  p_tagged jsonb, p_note_type text, p_is_private boolean,
  p_follow_up_required boolean, p_follow_up_note text, p_photo text,
  p_manager_name text, p_manager_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_node_id is null then
    return jsonb_build_object('ok', false, 'error', 'node_id required');
  end if;
  if coalesce(length(trim(p_summary)), 0) < 20 then
    return jsonb_build_object('ok', false, 'error', 'summary too short');
  end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  insert into public.shift_notes
    (tenant_id, node_id, note_date, shift, summary, tagged, note_type,
     is_private, follow_up_required, follow_up_note, photo, manager_name, manager_id)
  values
    (v_tenant, p_node_id, coalesce(p_note_date, current_date), coalesce(p_shift, 'AM'),
     trim(p_summary), coalesce(p_tagged, '[]'::jsonb), coalesce(p_note_type, 'general'),
     coalesce(p_is_private, false), coalesce(p_follow_up_required, false),
     case when coalesce(p_follow_up_required, false) then p_follow_up_note else null end,
     p_photo, p_manager_name, p_manager_id)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.shift_note_delete(
  p_id uuid, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from public.shift_notes where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Grants (RPC-only access; table stays RLS-locked) ─────────────────────────

grant execute on function public.get_shift_notes(uuid[], int)                                            to anon, authenticated;
grant execute on function public.shift_note_create(uuid, date, text, text, jsonb, text, boolean, boolean, text, text, text, uuid) to anon, authenticated;
grant execute on function public.shift_note_delete(uuid, uuid)                                            to anon, authenticated;
