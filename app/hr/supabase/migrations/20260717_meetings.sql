-- Meeting Scheduler — real backend for src/screens/Meetings.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon table policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.
--
-- meeting_records + get_meetings(uuid[]) already exist and hold real rows.
-- This migration:
--   1. Adds the extra scheduler columns the UI persists (type, room, video_link,
--      recurring, confidential, organizer, pre_note) to meeting_records.
--   2. Replaces get_meetings so those columns are returned.
--   3. Adds create_meeting / update_meeting / delete_meeting write RPCs.
--   4. Adds meeting_notes + meeting_rsvps tables and their read/write RPCs
--      (replaces the old localStorage-as-datastore + mock RSVP path).

-- ── meeting_records: additive columns (base table already exists) ─────────────

create table if not exists public.meeting_records (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  node_id       uuid,
  title         text not null,
  meeting_date  date,
  start_time    time,
  end_time      time,
  location      text,
  agenda        text,
  notes         text,
  attendee_ids  uuid[] not null default '{}',
  status        text not null default 'scheduled',
  created_by    uuid,
  created_at    timestamptz not null default now()
);

alter table public.meeting_records add column if not exists type         text        not null default 'general';
alter table public.meeting_records add column if not exists room         text        not null default 'huddle';
alter table public.meeting_records add column if not exists video_link   text;
alter table public.meeting_records add column if not exists recurring    text        not null default 'none';
alter table public.meeting_records add column if not exists confidential boolean     not null default false;
alter table public.meeting_records add column if not exists organizer    text;
alter table public.meeting_records add column if not exists pre_note     text;
alter table public.meeting_records add column if not exists tenant_id    uuid;
alter table public.meeting_records add column if not exists updated_at   timestamptz not null default now();

create index if not exists meeting_records_node_date_idx
  on public.meeting_records (node_id, meeting_date desc);

alter table public.meeting_records enable row level security;

-- ── meeting_notes: one running-notes record per meeting ───────────────────────
-- Mirrors the shape the UI previously kept in localStorage:
--   present_map / agenda_status = { key: value } jsonb maps
--   action_items = [{ id, description, owner, dueDate, status }]

create table if not exists public.meeting_notes (
  meeting_id    uuid primary key references public.meeting_records(id) on delete cascade,
  present_map   jsonb       not null default '{}'::jsonb,
  agenda_status jsonb       not null default '{}'::jsonb,
  action_items  jsonb       not null default '[]'::jsonb,
  next_date     date,
  shared        boolean     not null default false,
  updated_by    uuid,
  updated_at    timestamptz not null default now()
);

alter table public.meeting_notes enable row level security;

-- ── meeting_rsvps: per-attendee response ──────────────────────────────────────

create table if not exists public.meeting_rsvps (
  meeting_id uuid not null references public.meeting_records(id) on delete cascade,
  person_id  uuid not null,
  status     text not null,
  updated_at timestamptz not null default now(),
  primary key (meeting_id, person_id)
);

alter table public.meeting_rsvps enable row level security;

-- ── Reads ─────────────────────────────────────────────────────────────────────

-- Rebuild get_meetings to also surface the scheduler columns. Signature
-- (uuid[]) is preserved; only Meetings.jsx calls it.
drop function if exists public.get_meetings(uuid[]);
create or replace function public.get_meetings(p_node_ids uuid[])
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',           m.id,
      'node_id',      m.node_id,
      'title',        m.title,
      'type',         m.type,
      'room',         m.room,
      'meeting_date', m.meeting_date,
      'start_time',   m.start_time,
      'end_time',     m.end_time,
      'location',     m.location,
      'video_link',   m.video_link,
      'agenda',       m.agenda,
      'notes',        m.notes,
      'attendee_ids', coalesce(to_jsonb(m.attendee_ids), '[]'::jsonb),
      'status',       m.status,
      'recurring',    m.recurring,
      'confidential', m.confidential,
      'organizer',    m.organizer,
      'created_by',   m.created_by,
      'created_at',   m.created_at
    ) order by m.meeting_date, m.start_time
  ), '[]'::jsonb)
  from public.meeting_records m
  where m.node_id = any(p_node_ids);
$$;

-- All meeting notes within a location scope, for KPI / archive roll-ups.
create or replace function public.get_meeting_notes_bulk(p_node_ids uuid[])
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'meeting_id',    n.meeting_id,
      'present_map',   n.present_map,
      'agenda_status', n.agenda_status,
      'action_items',  n.action_items,
      'next_date',     n.next_date,
      'shared',        n.shared
    )
  ), '[]'::jsonb)
  from public.meeting_notes n
  join public.meeting_records m on m.id = n.meeting_id
  where m.node_id = any(p_node_ids);
$$;

-- This caller's RSVP responses within a location scope: { meeting_id: status }.
create or replace function public.get_my_rsvps(p_person_id uuid, p_node_ids uuid[])
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(r.meeting_id, r.status), '{}'::jsonb)
  from public.meeting_rsvps r
  join public.meeting_records m on m.id = r.meeting_id
  where r.person_id = p_person_id
    and m.node_id = any(p_node_ids);
$$;

-- ── Writes ────────────────────────────────────────────────────────────────────

create or replace function public.create_meeting(
  p_node_id      uuid,
  p_title        text,
  p_type         text,
  p_room         text,
  p_meeting_date date,
  p_start_time   time,
  p_end_time     time,
  p_location     text,
  p_video_link   text,
  p_agenda       text,
  p_recurring    text,
  p_confidential boolean,
  p_pre_note     text,
  p_attendee_ids uuid[],
  p_created_by   uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid; v_org text;
begin
  if coalesce(trim(p_title), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'title_required');
  end if;
  if p_node_id is null then
    return jsonb_build_object('ok', false, 'error', 'node_required');
  end if;

  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;
  select full_name into v_org    from public.people    where id = p_created_by;

  insert into public.meeting_records
    (tenant_id, node_id, title, type, room, meeting_date, start_time, end_time,
     location, video_link, agenda, recurring, confidential, pre_note,
     attendee_ids, status, organizer, created_by)
  values
    (v_tenant, p_node_id, trim(p_title), coalesce(p_type, 'general'),
     coalesce(p_room, 'huddle'), coalesce(p_meeting_date, current_date),
     p_start_time, p_end_time, p_location, p_video_link, p_agenda,
     coalesce(p_recurring, 'none'), coalesce(p_confidential, false), p_pre_note,
     coalesce(p_attendee_ids, '{}'), 'scheduled', v_org, p_created_by)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.update_meeting(
  p_id           uuid,
  p_title        text,
  p_type         text,
  p_room         text,
  p_meeting_date date,
  p_start_time   time,
  p_end_time     time,
  p_location     text,
  p_video_link   text,
  p_agenda       text,
  p_recurring    text,
  p_confidential boolean,
  p_attendee_ids uuid[],
  p_status       text
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.meeting_records set
    title        = coalesce(nullif(trim(p_title), ''), title),
    type         = coalesce(p_type, type),
    room         = coalesce(p_room, room),
    meeting_date = coalesce(p_meeting_date, meeting_date),
    start_time   = coalesce(p_start_time, start_time),
    end_time     = coalesce(p_end_time, end_time),
    location     = coalesce(p_location, location),
    video_link   = coalesce(p_video_link, video_link),
    agenda       = coalesce(p_agenda, agenda),
    recurring    = coalesce(p_recurring, recurring),
    confidential = coalesce(p_confidential, confidential),
    attendee_ids = coalesce(p_attendee_ids, attendee_ids),
    status       = coalesce(p_status, status),
    updated_at   = now()
  where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.delete_meeting(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from public.meeting_records where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Upsert the running notes (attendance, agenda status, action items) for a
-- meeting. Replaces the old localStorage store.
create or replace function public.save_meeting_notes(
  p_meeting_id   uuid,
  p_present_map  jsonb,
  p_agenda_status jsonb,
  p_action_items jsonb,
  p_next_date    date,
  p_shared       boolean,
  p_actor        uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.meeting_records where id = p_meeting_id) then
    return jsonb_build_object('ok', false, 'error', 'meeting_not_found');
  end if;

  insert into public.meeting_notes
    (meeting_id, present_map, agenda_status, action_items, next_date, shared, updated_by, updated_at)
  values
    (p_meeting_id, coalesce(p_present_map, '{}'::jsonb), coalesce(p_agenda_status, '{}'::jsonb),
     coalesce(p_action_items, '[]'::jsonb), p_next_date, coalesce(p_shared, false), p_actor, now())
  on conflict (meeting_id) do update set
    present_map   = coalesce(excluded.present_map, meeting_notes.present_map),
    agenda_status = coalesce(excluded.agenda_status, meeting_notes.agenda_status),
    action_items  = coalesce(excluded.action_items, meeting_notes.action_items),
    next_date     = excluded.next_date,
    shared        = meeting_notes.shared or excluded.shared,
    updated_by    = excluded.updated_by,
    updated_at    = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- Record / toggle a single attendee's RSVP. Passing the same status twice clears it.
create or replace function public.set_meeting_rsvp(
  p_meeting_id uuid,
  p_person_id  uuid,
  p_status     text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_existing text;
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'person_required');
  end if;

  select status into v_existing
    from public.meeting_rsvps
    where meeting_id = p_meeting_id and person_id = p_person_id;

  if v_existing is not null and v_existing = p_status then
    delete from public.meeting_rsvps
      where meeting_id = p_meeting_id and person_id = p_person_id;
    return jsonb_build_object('ok', true, 'status', null);
  end if;

  insert into public.meeting_rsvps (meeting_id, person_id, status, updated_at)
  values (p_meeting_id, p_person_id, p_status, now())
  on conflict (meeting_id, person_id) do update set
    status = excluded.status, updated_at = now();

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

-- ── Grants (RPC-only access) ──────────────────────────────────────────────────

grant execute on function public.get_meetings(uuid[])                                to anon, authenticated;
grant execute on function public.get_meeting_notes_bulk(uuid[])                      to anon, authenticated;
grant execute on function public.get_my_rsvps(uuid, uuid[])                          to anon, authenticated;
grant execute on function public.create_meeting(uuid, text, text, text, date, time, time, text, text, text, text, boolean, text, uuid[], uuid) to anon, authenticated;
grant execute on function public.update_meeting(uuid, text, text, text, date, time, time, text, text, text, text, boolean, uuid[], text) to anon, authenticated;
grant execute on function public.delete_meeting(uuid)                                to anon, authenticated;
grant execute on function public.save_meeting_notes(uuid, jsonb, jsonb, jsonb, date, boolean, uuid) to anon, authenticated;
grant execute on function public.set_meeting_rsvp(uuid, uuid, text)                  to anon, authenticated;
