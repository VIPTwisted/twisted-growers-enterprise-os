-- Communications backend — real wiring for src/screens/Communications.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly.
--
-- REUSES (does not duplicate):
--   * announcements(id, node_id, title, body, author_id, requires_ack,
--                   created_at, expires_at, pinned)            — the broadcast store
--   * announcement_reads(announcement_id, person_id, read_at, acked_at) — receipts
--   * direct_messages(id, from_id, to_id, body, read_at, created_at)    — DMs/reminders
--   * people / assignments / org_nodes / roles                          — directory
--   * existing RPCs post_announcement, get_communications, get_messages,
--     send_dm, mark_message_read, get_roster stay untouched and keep working.
--
-- ADDS:
--   * Targeting/priority columns on announcements (nullable, default-safe —
--     every pre-existing row keeps its exact current meaning).
--   * SECURITY DEFINER RPCs (granted to anon, authenticated — same auth model
--     as every sibling HR RPC; the app signs in via pin_login and calls RPCs
--     under the anon role):
--       comms_person_directory()                      — active people + latest assignment
--       announcement_recipients(uuid)                 — resolved audience of one broadcast
--       get_shift_broadcasts(uuid, uuid[], int)       — broadcast feed w/ counts + my state
--       get_broadcast_receipts(uuid)                  — per-person read/ack forensics
--       post_shift_broadcast(...)                     — targeted broadcast writer
--       broadcast_mark_read(uuid, uuid)               — read receipt upsert
--       broadcast_ack(uuid, uuid)                     — acknowledgment upsert
--       broadcast_remind(uuid, uuid)                  — DM reminder to non-acked/non-read
--       get_comms_hub(uuid, uuid[])                   — hub KPIs + real activity feed
--
-- No fake rows are ever inserted. Every feed starts honestly empty.

-- ── 1) Extend announcements with targeting metadata ──────────────────────────
alter table public.announcements add column if not exists priority     text default 'FYI';
alter table public.announcements add column if not exists kind         text default 'Announcement';
alter table public.announcements add column if not exists shift_target text default 'All Shifts';
alter table public.announcements add column if not exists node_ids     uuid[];
alter table public.announcements add column if not exists role_names   text[];
alter table public.announcements add column if not exists person_ids   uuid[];
alter table public.announcements add column if not exists scheduled_at timestamptz;

create index if not exists announcements_created_idx on public.announcements (created_at desc);
create index if not exists announcement_reads_ann_idx on public.announcement_reads (announcement_id);

-- ── 2) Directory: active people + latest assignment (node + role) ────────────
create or replace function public.comms_person_directory()
returns table(person_id uuid, full_name text, node_id uuid, node_name text, role_name text)
language sql stable security definer set search_path = public as $fn$
  select distinct on (p.id)
    p.id,
    coalesce(p.display_name, p.full_name),
    a.node_id,
    n.name,
    r.name
  from public.people p
  left join public.assignments a on a.person_id = p.id
  left join public.org_nodes n   on n.id = a.node_id
  left join public.roles r       on r.id = a.role_id
  where coalesce(p.is_active, true)
  order by p.id, a.effective_from desc nulls last
$fn$;
grant execute on function public.comms_person_directory() to anon, authenticated;

-- ── 3) Resolved audience of one announcement ─────────────────────────────────
-- Semantics: no targeting at all (legacy rows: node_id null, arrays null)
-- = everyone. Otherwise the audience is the UNION of matched locations,
-- roles and named individuals (matches the composer's "Custom (Multi)").
create or replace function public.announcement_recipients(p_announcement_id uuid)
returns table(person_id uuid, full_name text, node_id uuid, node_name text, role_name text)
language sql stable security definer set search_path = public as $fn$
  with a as (
    select coalesce(node_ids, case when node_id is not null then array[node_id] end) as nodes,
           role_names, person_ids
    from public.announcements
    where id = p_announcement_id
  )
  select d.person_id, d.full_name, d.node_id, d.node_name, d.role_name
  from public.comms_person_directory() d, a
  where (a.nodes is null and a.role_names is null and a.person_ids is null)
     or (a.nodes      is not null and d.node_id   = any(a.nodes))
     or (a.role_names is not null and d.role_name = any(a.role_names))
     or (a.person_ids is not null and d.person_id = any(a.person_ids))
$fn$;
grant execute on function public.announcement_recipients(uuid) to anon, authenticated;

-- ── 4) Broadcast feed with live counts + caller's own read/ack state ─────────
create or replace function public.get_shift_broadcasts(
  p_person_id uuid,
  p_node_ids  uuid[] default null,
  p_limit     int    default 100
) returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(row_to_json(t) order by t.pinned desc, t.created_at desc), '[]'::jsonb)
  from (
    select
      a.id, a.title, a.body,
      upper(coalesce(nullif(btrim(a.priority), ''), 'FYI'))       as priority,
      coalesce(nullif(btrim(a.kind), ''), 'Announcement')         as kind,
      coalesce(nullif(btrim(a.shift_target), ''), 'All Shifts')   as shift_target,
      coalesce(a.requires_ack, false)                             as requires_ack,
      coalesce(a.pinned, false)                                   as pinned,
      a.created_at, a.expires_at, a.scheduled_at,
      case
        when a.scheduled_at is not null and a.scheduled_at > now() then 'SCHEDULED'
        when a.expires_at   is not null and a.expires_at   < now() then 'EXPIRED'
        else 'ACTIVE'
      end as status,
      au.full_name as sender_name,
      au.role_name as sender_role,
      (select jsonb_agg(n.name order by n.name)
         from public.org_nodes n
        where n.id = any(coalesce(a.node_ids,
                          case when a.node_id is not null then array[a.node_id] end)))
        as target_locations,
      a.role_names  as target_roles,
      (select count(*)::int from public.announcement_recipients(a.id))                              as total_recipients,
      (select count(*)::int from public.announcement_reads r
        where r.announcement_id = a.id and r.read_at  is not null)                                  as read_count,
      (select count(*)::int from public.announcement_reads r
        where r.announcement_id = a.id and r.acked_at is not null)                                  as ack_count,
      exists(select 1 from public.announcement_reads r
              where r.announcement_id = a.id and r.person_id = p_person_id
                and r.read_at  is not null)                                                         as my_read,
      exists(select 1 from public.announcement_reads r
              where r.announcement_id = a.id and r.person_id = p_person_id
                and r.acked_at is not null)                                                         as my_acked
    from public.announcements a
    left join lateral (
      select d.full_name, d.role_name
      from public.comms_person_directory() d
      where d.person_id = a.author_id
    ) au on true
    where p_node_ids is null
       or (a.node_ids is null and a.node_id is null)
       or (a.node_ids is not null and a.node_ids && p_node_ids)
       or (a.node_id  is not null and a.node_id = any(p_node_ids))
       or a.role_names is not null
       or a.person_ids is not null
    order by coalesce(a.pinned, false) desc, a.created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
  ) t;
$fn$;
grant execute on function public.get_shift_broadcasts(uuid, uuid[], int) to anon, authenticated;

-- ── 5) Per-person receipt forensics for one broadcast ────────────────────────
create or replace function public.get_broadcast_receipts(p_announcement_id uuid)
returns jsonb language sql stable security definer set search_path = public as $fn$
  select coalesce(jsonb_agg(row_to_json(t) order by t.full_name), '[]'::jsonb)
  from (
    select
      rec.person_id as id,
      rec.full_name,
      coalesce(rec.node_name, '—') as location,
      coalesce(rec.role_name, '—') as role,
      r.read_at, r.acked_at,
      (r.read_at  is not null) as read,
      (r.acked_at is not null) as acked
    from public.announcement_recipients(p_announcement_id) rec
    left join public.announcement_reads r
      on r.announcement_id = p_announcement_id and r.person_id = rec.person_id
  ) t;
$fn$;
grant execute on function public.get_broadcast_receipts(uuid) to anon, authenticated;

-- ── 6) Targeted broadcast writer ─────────────────────────────────────────────
create or replace function public.post_shift_broadcast(
  p_author_id    uuid,
  p_title        text,
  p_body         text,
  p_priority     text        default 'FYI',
  p_node_ids     uuid[]      default null,
  p_shift        text        default 'All Shifts',
  p_expires_at   timestamptz default null,
  p_require_ack  boolean     default false,
  p_pin          boolean     default false,
  p_kind         text        default 'Announcement',
  p_role_names   text[]      default null,
  p_person_ids   uuid[]      default null,
  p_scheduled_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_id  uuid;
  v_pri text;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'title and body are required');
  end if;
  v_pri := upper(coalesce(nullif(btrim(p_priority), ''), 'FYI'));
  if v_pri not in ('URGENT', 'IMPORTANT', 'FYI') then v_pri := 'FYI'; end if;

  insert into public.announcements
    (title, body, author_id, requires_ack, pinned, expires_at,
     priority, kind, shift_target, node_ids, role_names, person_ids, scheduled_at, node_id)
  values
    (btrim(p_title), btrim(p_body), p_author_id,
     coalesce(p_require_ack, false), coalesce(p_pin, false), p_expires_at,
     v_pri,
     coalesce(nullif(btrim(p_kind), ''), 'Announcement'),
     coalesce(nullif(btrim(p_shift), ''), 'All Shifts'),
     case when p_node_ids   is not null and array_length(p_node_ids, 1)   > 0 then p_node_ids   end,
     case when p_role_names is not null and array_length(p_role_names, 1) > 0 then p_role_names end,
     case when p_person_ids is not null and array_length(p_person_ids, 1) > 0 then p_person_ids end,
     p_scheduled_at,
     -- keep the legacy single-node column coherent when exactly one location is targeted
     case when p_node_ids is not null and array_length(p_node_ids, 1) = 1 then p_node_ids[1] end)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$fn$;
grant execute on function public.post_shift_broadcast(uuid, text, text, text, uuid[], text, timestamptz, boolean, boolean, text, text[], uuid[], timestamptz) to anon, authenticated;

-- ── 7) Read receipt / acknowledgment upserts ─────────────────────────────────
-- announcement_reads has no surrogate id; upsert manually on (announcement_id, person_id).
create or replace function public.broadcast_mark_read(p_announcement_id uuid, p_person_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if p_announcement_id is null or p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'announcement and person required');
  end if;
  update public.announcement_reads
     set read_at = coalesce(read_at, now())
   where announcement_id = p_announcement_id and person_id = p_person_id;
  if not found then
    insert into public.announcement_reads (announcement_id, person_id, read_at)
    values (p_announcement_id, p_person_id, now());
  end if;
  return jsonb_build_object('ok', true);
end;
$fn$;
grant execute on function public.broadcast_mark_read(uuid, uuid) to anon, authenticated;

create or replace function public.broadcast_ack(p_announcement_id uuid, p_person_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if p_announcement_id is null or p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'announcement and person required');
  end if;
  update public.announcement_reads
     set read_at  = coalesce(read_at, now()),
         acked_at = coalesce(acked_at, now())
   where announcement_id = p_announcement_id and person_id = p_person_id;
  if not found then
    insert into public.announcement_reads (announcement_id, person_id, read_at, acked_at)
    values (p_announcement_id, p_person_id, now(), now());
  end if;
  return jsonb_build_object('ok', true);
end;
$fn$;
grant execute on function public.broadcast_ack(uuid, uuid) to anon, authenticated;

-- ── 8) Reminder: DM every outstanding recipient (real direct_messages rows) ──
create or replace function public.broadcast_remind(p_announcement_id uuid, p_sender_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_title text;
  v_req   boolean;
  v_n     int := 0;
  rec     record;
begin
  select title, coalesce(requires_ack, false) into v_title, v_req
  from public.announcements where id = p_announcement_id;
  if v_title is null then
    return jsonb_build_object('ok', false, 'error', 'broadcast not found');
  end if;

  for rec in
    select r0.person_id
    from public.announcement_recipients(p_announcement_id) r0
    left join public.announcement_reads r
      on r.announcement_id = p_announcement_id and r.person_id = r0.person_id
    where r0.person_id is distinct from p_sender_id
      and ((v_req and r.acked_at is null) or ((not v_req) and r.read_at is null))
  loop
    insert into public.direct_messages (from_id, to_id, body)
    values (p_sender_id, rec.person_id,
            'Reminder: please review the broadcast "' || v_title || '"'
            || case when v_req then ' and acknowledge it.' else '.' end);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'reminded', v_n);
end;
$fn$;
grant execute on function public.broadcast_remind(uuid, uuid) to anon, authenticated;

-- ── 9) Hub aggregate: KPIs + real merged activity feed ───────────────────────
-- chat_messages is created by the sibling 20260717_chat.sql migration; guard
-- the reference so this function works whether or not chat is applied yet.
create or replace function public.get_comms_hub(p_person_id uuid, p_node_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_chat     jsonb := '[]'::jsonb;
  v_activity jsonb;
  v          jsonb;
begin
  if to_regclass('public.chat_messages') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'src', 'chat',
               'sender', coalesce(m.sender_name, 'Someone'),
               'preview', m.body,
               'at', m.created_at) order by m.created_at desc), '[]'::jsonb)
      from (select sender_name, body, created_at
            from public.chat_messages
            where parent_id is null
            order by created_at desc
            limit 12) m
    $q$ into v_chat;
  end if;

  select coalesce(jsonb_agg(u.x order by (u.x ->> 'at') desc), '[]'::jsonb) into v_activity
  from (
    (select jsonb_build_object(
        'src', case when upper(coalesce(a.priority, 'FYI')) = 'URGENT' then 'hr' else 'announce' end,
        'sender', coalesce((select coalesce(p.display_name, p.full_name)
                            from public.people p where p.id = a.author_id), '—'),
        'preview', coalesce(a.title, '')
          || case when coalesce(a.title, '') <> '' and coalesce(a.body, '') <> '' then ' — ' else '' end
          || coalesce(a.body, ''),
        'at', a.created_at) as x
     from public.announcements a
     where a.scheduled_at is null or a.scheduled_at <= now()
     order by a.created_at desc
     limit 8)
    union all
    (select jsonb_build_object(
        'src', 'dm',
        'sender', coalesce((select coalesce(p.display_name, p.full_name)
                            from public.people p where p.id = m.from_id), '—'),
        'preview', m.body,
        'at', m.created_at)
     from public.direct_messages m
     where m.from_id = p_person_id or m.to_id = p_person_id
     order by m.created_at desc
     limit 8)
  ) u(x);

  select jsonb_build_object(
    'unread_dms', (select count(*)::int from public.direct_messages
                    where to_id = p_person_id and read_at is null),
    'unread_old_dms', (select count(*)::int from public.direct_messages
                        where to_id = p_person_id and read_at is null
                          and created_at < now() - interval '24 hours'),
    'dm_today',  (select count(*)::int from public.direct_messages
                   where created_at >= date_trunc('day', now())),
    'dm_week',   (select count(*)::int from public.direct_messages
                   where created_at >= date_trunc('week', now())),
    'ann_today', (select count(*)::int from public.announcements
                   where created_at >= date_trunc('day', now())),
    'ann_week',  (select count(*)::int from public.announcements
                   where created_at >= date_trunc('week', now())),
    'ann_month', (select count(*)::int from public.announcements
                   where created_at >= date_trunc('month', now())),
    'active_convos', (select count(distinct case when from_id = p_person_id then to_id else from_id end)::int
                       from public.direct_messages
                       where (from_id = p_person_id or to_id = p_person_id)
                         and created_at >= now() - interval '7 days'),
    'active_staff', (select count(*)::int from public.comms_person_directory() d
                      where p_node_ids is null or d.node_id = any(p_node_ids)),
    'pending_acks_mine', (select count(*)::int from public.announcements a
                           where coalesce(a.requires_ack, false)
                             and (a.expires_at is null or a.expires_at > now())
                             and (a.scheduled_at is null or a.scheduled_at <= now())
                             and exists (select 1 from public.announcement_recipients(a.id) r
                                          where r.person_id = p_person_id)
                             and not exists (select 1 from public.announcement_reads r
                                              where r.announcement_id = a.id
                                                and r.person_id = p_person_id
                                                and r.acked_at is not null)),
    'avg_read_rate', (select round(avg(s.rr))::int from (
                        select (select count(*) from public.announcement_reads r
                                 where r.announcement_id = a.id and r.read_at is not null)::numeric * 100
                               / nullif((select count(*) from public.announcement_recipients(a.id)), 0) as rr
                        from public.announcements a
                        where a.created_at >= now() - interval '30 days') s
                      where s.rr is not null),
    'activity', v_activity,
    'chat_activity', v_chat
  ) into v;

  return v;
end;
$fn$;
grant execute on function public.get_comms_hub(uuid, uuid[]) to anon, authenticated;
