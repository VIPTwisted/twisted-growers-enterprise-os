-- Direct Messages (personal DM inbox) — real backing for src/screens/Messages.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon table policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated
-- (the app authenticates via pin_login and calls RPCs under the anon role,
-- exactly like every sibling HR RPC).
--
-- REUSES (does NOT duplicate — the DM store + core reads/writes already exist):
--   * direct_messages(id, from_id, to_id, body, read_at, created_at)  — the DM store
--   * get_messages(p_person_id)          — flat feed of my sent + received DMs
--   * send_dm(p_from_id, p_to_id, p_body)— write a DM
--   * mark_message_read(p_message_id)    — read receipt on one message
--   * comms_person_directory()           — active people + node + role
--
-- ADDS ONLY the one capability with no existing backing: per-user, per-thread
-- STAR / ARCHIVE state (a conversation is keyed by the OTHER party's person id).
-- No fake rows are ever inserted — every conversation starts un-starred and in
-- the inbox until the signed-in user acts.

-- ── Per-user conversation state (star / archive) ─────────────────────────────
create table if not exists public.dm_conversation_state (
  person_id  uuid        not null,   -- the signed-in user (owner of this state)
  other_id   uuid        not null,   -- the other party in the 1:1 conversation
  starred    boolean     not null default false,
  archived   boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (person_id, other_id)
);
alter table public.dm_conversation_state enable row level security;

-- ── Read: all conversation flags for the signed-in user ──────────────────────
create or replace function public.get_dm_conversation_state(p_person_id uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'other_id', other_id,
           'starred',  starred,
           'archived', archived)), '[]'::jsonb)
  from public.dm_conversation_state
  where person_id = p_person_id;
$fn$;
grant execute on function public.get_dm_conversation_state(uuid) to anon, authenticated;

-- ── Write: toggle STAR on a conversation; returns the new state ──────────────
create or replace function public.dm_toggle_star(p_person_id uuid, p_other_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v boolean;
begin
  if p_person_id is null or p_other_id is null then
    return jsonb_build_object('ok', false, 'error', 'person and other required');
  end if;
  insert into public.dm_conversation_state (person_id, other_id, starred)
  values (p_person_id, p_other_id, true)
  on conflict (person_id, other_id)
    do update set starred = not public.dm_conversation_state.starred, updated_at = now()
  returning starred into v;
  return jsonb_build_object('ok', true, 'starred', v);
end;
$fn$;
grant execute on function public.dm_toggle_star(uuid, uuid) to anon, authenticated;

-- ── Write: toggle ARCHIVE on a conversation; returns the new state ───────────
create or replace function public.dm_toggle_archive(p_person_id uuid, p_other_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v boolean;
begin
  if p_person_id is null or p_other_id is null then
    return jsonb_build_object('ok', false, 'error', 'person and other required');
  end if;
  insert into public.dm_conversation_state (person_id, other_id, archived)
  values (p_person_id, p_other_id, true)
  on conflict (person_id, other_id)
    do update set archived = not public.dm_conversation_state.archived, updated_at = now()
  returning archived into v;
  return jsonb_build_object('ok', true, 'archived', v);
end;
$fn$;
grant execute on function public.dm_toggle_archive(uuid, uuid) to anon, authenticated;
