-- ============================================================================
-- Notification Center — real backend for src/screens/NotificationCenter.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly.
-- ----------------------------------------------------------------------------
-- The screen previously rendered a seed()-generated MOCK feed (buildNotifications:
-- fabricated EMPLOYEES / LOCATIONS / TRAINING_MODULES woven into fake late-clock-in,
-- PTO, disciplinary, broadcast and "resolved" cards) and stored read-state in
-- localStorage. This migration replaces that with a single, honest, unified feed
-- aggregated across the real HR artifact tables the platform already owns:
--
-- REUSES (does not duplicate):
--   * notifications(id, node_id, title, body, category, priority, is_read, created_at)
--   * time_punches(id, person_id, node_id, punched_in_at, punched_out_at, work_date)
--   * time_off_requests(id, person_id, node_id, type, start_date, end_date, status, created_at, reviewed_at)
--   * shift_claims(id, shift_id, person_id, node_id, status, note, created_at)
--   * disciplinary_records(id, person_id, node_id, type, date, status, created_at, updated_at)
--   * incidents(id, reported_by, node_id, type, severity, date, status, created_at)
--   * training_records(id, person_id, node_id, module, completed_at, expires_at, status)
--   * announcements(id, title, body, author_id, node_id, node_ids, requires_ack, priority,
--                   scheduled_at, expires_at, created_at) + announcement_reads
--   * direct_messages(from_id, to_id, body, read_at, created_at)   [read via SECURITY DEFINER]
--   * people / org_nodes                                            — name resolution
--   * existing RPCs get_pending_pto_count / get_pending_tasks_count stay untouched
--     and keep feeding the "Pending Approvals" KPI.
--
-- ADDS (nothing else fits — no existing table records "which manager dismissed a
-- DERIVED alert", and no single RPC returns a cross-domain notification feed):
--   * notification_reads(person_id, notif_key, read_at)  — per-user read receipts
--     keyed by the synthetic feed key so derived alerts can be marked read.
--   * get_notification_center(uuid, uuid[])   — unified feed + live counts
--   * notif_mark_read(uuid, text)             — mark one item read (+ native stores)
--   * notif_mark_all_read(uuid, uuid[])       — mark every visible item read
--
-- No fake rows are ever inserted. The feed is honest — empty when the tenant is empty.
-- ============================================================================

-- ── 1) Per-user read receipts for the unified feed ──────────────────────────
create table if not exists public.notification_reads (
  person_id  uuid        not null,
  notif_key  text        not null,
  read_at    timestamptz not null default now(),
  primary key (person_id, notif_key)
);
alter table public.notification_reads enable row level security;
grant select, insert, update on public.notification_reads to anon, authenticated;

-- ── 2) Unified notification feed + live counts ──────────────────────────────
-- Returns { items: [...], counts: {...} }. Every item carries:
--   key, category (TIME|APPROVAL|HR|MESSAGE|INFO), message, employee, location,
--   ts, read, action ('link'|null), action_label, link_to, priority.
create or replace function public.get_notification_center(
  p_person_id uuid,
  p_node_ids  uuid[] default null
) returns jsonb
language sql stable security definer set search_path = public as $fn$
  with src as (
    -- ── Real notifications store (node-scoped platform notifications) ────────
    select
      'notif:' || n.id::text                                        as key,
      case
        when lower(coalesce(n.category,'')) like '%time%'   then 'TIME'
        when lower(coalesce(n.category,'')) like '%approv%' then 'APPROVAL'
        when lower(coalesce(n.category,'')) like '%hr%'
          or lower(coalesce(n.category,'')) like '%discip%' then 'HR'
        when lower(coalesce(n.category,'')) like '%messag%'
          or lower(coalesce(n.category,'')) like '%msg%'    then 'MESSAGE'
        else 'INFO'
      end                                                           as category,
      coalesce(n.title,'') ||
        case when coalesce(n.title,'') <> '' and coalesce(n.body,'') <> '' then ' — ' else '' end ||
        coalesce(n.body,'')                                         as message,
      'System'::text                                                as employee,
      n.node_id                                                     as node_id,
      n.created_at                                                  as ts,
      coalesce(n.is_read, false)                                    as native_read,
      null::text                                                    as action,
      null::text                                                    as action_label,
      null::text                                                    as link_to,
      upper(coalesce(n.priority,'FYI'))                             as priority
    from public.notifications n
    where p_node_ids is null or n.node_id = any(p_node_ids)

    union all
    -- ── TIME: still clocked in (no clock-out) for 9h+ ───────────────────────
    select
      'punch:' || tp.id::text,
      'TIME',
      coalesce(pe.full_name,'An employee') ||
        ' has not clocked out — on the clock since ' ||
        to_char(tp.punched_in_at, 'Mon DD HH12:MI AM'),
      coalesce(pe.full_name,'—'),
      tp.node_id,
      tp.punched_in_at,
      false,
      'link', 'Edit Timecard', '/timeclock',
      'IMPORTANT'
    from public.time_punches tp
    left join public.people pe on pe.id = tp.person_id
    where tp.punched_out_at is null
      and tp.punched_in_at is not null
      and tp.punched_in_at < now() - interval '9 hours'
      and (p_node_ids is null or tp.node_id = any(p_node_ids))

    union all
    -- ── APPROVAL: pending PTO / leave requests ──────────────────────────────
    select
      'pto:' || t.id::text,
      'APPROVAL',
      'PTO / leave request from ' || coalesce(pe.full_name,'an employee') ||
        ' — ' || coalesce(to_char(t.start_date,'Mon DD'),'?') ||
        '–' || coalesce(to_char(t.end_date,'Mon DD'),'?') || ' — awaiting approval',
      coalesce(pe.full_name,'—'),
      t.node_id,
      t.created_at,
      false,
      'link', 'Review', '/requests',
      'IMPORTANT'
    from public.time_off_requests t
    left join public.people pe on pe.id = t.person_id
    where lower(coalesce(t.status,'pending')) = 'pending'
      and (p_node_ids is null or t.node_id = any(p_node_ids))

    union all
    -- ── APPROVAL: pending shift claims (swap/coverage pickups) ──────────────
    select
      'claim:' || c.id::text,
      'APPROVAL',
      'Shift claim from ' || coalesce(pe.full_name,'an employee') ||
        ' — awaiting manager approval' ||
        case when coalesce(c.note,'') <> '' then ' (' || c.note || ')' else '' end,
      coalesce(pe.full_name,'—'),
      c.node_id,
      c.created_at,
      false,
      'link', 'Review', '/requests',
      'FYI'
    from public.shift_claims c
    left join public.people pe on pe.id = c.person_id
    where lower(coalesce(c.status,'pending')) = 'pending'
      and (p_node_ids is null or c.node_id = any(p_node_ids))

    union all
    -- ── HR: active disciplinary records ─────────────────────────────────────
    select
      'da:' || d.id::text,
      'HR',
      coalesce(pe.full_name,'An employee') ||
        ' — ' || initcap(replace(coalesce(d.type,'action'),'_',' ')) ||
        ' (' || to_char(d.date,'Mon DD') || ') — active',
      coalesce(pe.full_name,'—'),
      d.node_id,
      coalesce(d.created_at, d.date::timestamptz),
      false,
      'link', 'View DA', '/disciplinary',
      'URGENT'
    from public.disciplinary_records d
    left join public.people pe on pe.id = d.person_id
    where lower(coalesce(d.status,'')) = 'active'
      and (p_node_ids is null or d.node_id = any(p_node_ids))

    union all
    -- ── HR: open incident reports ───────────────────────────────────────────
    select
      'inc:' || i.id::text,
      'HR',
      'Open incident — ' || initcap(replace(coalesce(i.type,'report'),'_',' ')) ||
        case when coalesce(i.severity,'') <> '' then ' (' || initcap(i.severity) || ')' else '' end ||
        ' — reported ' || to_char(coalesce(i.date::timestamptz, i.created_at),'Mon DD'),
      coalesce(pe.full_name,'—'),
      i.node_id,
      coalesce(i.created_at, i.date::timestamptz),
      false,
      'link', 'View Report', '/forms',
      'URGENT'
    from public.incidents i
    left join public.people pe on pe.id = i.reported_by
    where lower(coalesce(i.status,'open')) not in ('resolved','closed','complete','completed')
      and (p_node_ids is null or i.node_id = any(p_node_ids))

    union all
    -- ── HR: expired training certifications ─────────────────────────────────
    select
      'train:' || tr.id::text,
      'HR',
      'Training certification expired: ' || coalesce(pe.full_name,'an employee') ||
        ' — ' || coalesce(nullif(tr.module,''),'module'),
      coalesce(pe.full_name,'—'),
      tr.node_id,
      coalesce(tr.expires_at::timestamptz, tr.completed_at),
      false,
      'link', 'Reassign', '/training',
      'IMPORTANT'
    from public.training_records tr
    left join public.people pe on pe.id = tr.person_id
    where tr.expires_at is not null
      and tr.expires_at < current_date
      and (p_node_ids is null or tr.node_id = any(p_node_ids))

    union all
    -- ── MESSAGE: broadcasts / announcements ─────────────────────────────────
    select
      'ann:' || a.id::text,
      'MESSAGE',
      'Broadcast: ' || coalesce(a.title,'(untitled)') ||
        case when coalesce(a.body,'') <> '' then ' — ' || a.body else '' end ||
        case when coalesce(a.requires_ack,false) then ' (acknowledgment required)' else '' end,
      coalesce((select coalesce(pe.display_name, pe.full_name)
                from public.people pe where pe.id = a.author_id), 'System'),
      coalesce(a.node_id, (a.node_ids)[1]),
      a.created_at,
      exists(select 1 from public.announcement_reads r
              where r.announcement_id = a.id and r.person_id = p_person_id
                and r.read_at is not null),
      null, null, null,
      upper(coalesce(a.priority,'FYI'))
    from public.announcements a
    where (a.scheduled_at is null or a.scheduled_at <= now())
      and (a.expires_at is null or a.expires_at > now())
      and (
        p_node_ids is null
        or (a.node_id is null and a.node_ids is null)
        or (a.node_id  is not null and a.node_id = any(p_node_ids))
        or (a.node_ids is not null and a.node_ids && p_node_ids)
      )

    union all
    -- ── MESSAGE: unread direct messages to the caller ───────────────────────
    select
      'dm:' || m.id::text,
      'MESSAGE',
      coalesce(pe.full_name,'Someone') || ' sent you a direct message',
      coalesce(pe.full_name,'—'),
      null::uuid,
      m.created_at,
      false,
      'link', 'Open', '/messages',
      'FYI'
    from public.direct_messages m
    left join public.people pe on pe.id = m.from_id
    where m.to_id = p_person_id and m.read_at is null

    union all
    -- ── INFO: recently resolved disciplinary records ────────────────────────
    select
      'da_res:' || d.id::text,
      'INFO',
      'Disciplinary resolved — ' || coalesce(pe.full_name,'employee') ||
        ' (' || initcap(replace(coalesce(d.type,'action'),'_',' ')) || ')',
      coalesce(pe.full_name,'—'),
      d.node_id,
      coalesce(d.updated_at, d.created_at),
      false,
      null, null, null,
      'FYI'
    from public.disciplinary_records d
    left join public.people pe on pe.id = d.person_id
    where lower(coalesce(d.status,'')) = 'resolved'
      and coalesce(d.updated_at, d.created_at) >= now() - interval '7 days'
      and (p_node_ids is null or d.node_id = any(p_node_ids))

    union all
    -- ── INFO: recently approved PTO ─────────────────────────────────────────
    select
      'pto_ok:' || t.id::text,
      'INFO',
      'PTO approved — ' || coalesce(pe.full_name,'employee') ||
        ' (' || coalesce(to_char(t.start_date,'Mon DD'),'?') || ')',
      coalesce(pe.full_name,'—'),
      t.node_id,
      coalesce(t.reviewed_at, t.created_at),
      false,
      null, null, null,
      'FYI'
    from public.time_off_requests t
    left join public.people pe on pe.id = t.person_id
    where lower(coalesce(t.status,'')) = 'approved'
      and coalesce(t.reviewed_at, t.created_at) >= now() - interval '7 days'
      and (p_node_ids is null or t.node_id = any(p_node_ids))

    union all
    -- ── INFO: recently completed training ───────────────────────────────────
    select
      'train_done:' || tr.id::text,
      'INFO',
      coalesce(pe.full_name,'An employee') || ' completed ' ||
        coalesce(nullif(tr.module,''),'a training module'),
      coalesce(pe.full_name,'—'),
      tr.node_id,
      tr.completed_at,
      false,
      null, null, null,
      'FYI'
    from public.training_records tr
    left join public.people pe on pe.id = tr.person_id
    where tr.completed_at is not null
      and tr.completed_at >= now() - interval '7 days'
      and (p_node_ids is null or tr.node_id = any(p_node_ids))
  ),
  enriched as (
    select
      s.*,
      coalesce(n.name, 'All Locations') as location,
      (s.native_read or nr.notif_key is not null) as is_read
    from src s
    left join public.org_nodes n on n.id = s.node_id
    left join public.notification_reads nr
      on nr.person_id = p_person_id and nr.notif_key = s.key
  ),
  items as (
    select jsonb_build_object(
      'id',           key,
      'key',          key,
      'category',     category,
      'message',      message,
      'employee',     employee,
      'location',     location,
      'ts',           ts,
      'read',         is_read,
      'action',       action,
      'actionLabel',  action_label,
      'linkTo',       link_to,
      'priority',     priority
    ) as obj, ts, is_read, category
    from enriched
    order by ts desc nulls last
    limit 200
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(obj order by ts desc nulls last) from items), '[]'::jsonb),
    'counts', jsonb_build_object(
      'total',            (select count(*)::int from items),
      'unread',           (select count(*)::int from items where not is_read),
      'hr_alerts',        (select count(*)::int from items where category = 'HR'),
      'approvals',        (select count(*)::int from items where category = 'APPROVAL'),
      'messages_unread',  (select count(*)::int from items where category = 'MESSAGE' and not is_read),
      'resolved',         (select count(*)::int from items where category = 'INFO')
    )
  );
$fn$;
grant execute on function public.get_notification_center(uuid, uuid[]) to anon, authenticated;

-- ── 3) Mark one feed item read (persists to native stores where applicable) ─
create or replace function public.notif_mark_read(p_person_id uuid, p_notif_key text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if p_person_id is null or coalesce(btrim(p_notif_key),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'person and key required');
  end if;

  insert into public.notification_reads (person_id, notif_key)
  values (p_person_id, p_notif_key)
  on conflict (person_id, notif_key) do update set read_at = now();

  -- Reflect into the native store the key points at, so read-state is coherent
  -- across the whole platform (badge counts, other surfaces).
  if p_notif_key like 'notif:%' then
    begin
      v_id := substring(p_notif_key from 7)::uuid;
      update public.notifications set is_read = true where id = v_id;
    exception when others then null;
    end;
  elsif p_notif_key like 'ann:%' then
    begin
      v_id := substring(p_notif_key from 5)::uuid;
      update public.announcement_reads
         set read_at = coalesce(read_at, now())
       where announcement_id = v_id and person_id = p_person_id;
      if not found then
        insert into public.announcement_reads (announcement_id, person_id, read_at)
        values (v_id, p_person_id, now());
      end if;
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;
grant execute on function public.notif_mark_read(uuid, text) to anon, authenticated;

-- ── 4) Mark every currently-visible item read for the caller ────────────────
create or replace function public.notif_mark_all_read(p_person_id uuid, p_node_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_n int := 0; rec record;
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'person required');
  end if;
  for rec in
    select (i->>'key') as key
    from jsonb_array_elements(
           (public.get_notification_center(p_person_id, p_node_ids))->'items') i
    where coalesce((i->>'read')::boolean, false) = false
  loop
    perform public.notif_mark_read(p_person_id, rec.key);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'marked', v_n);
end;
$fn$;
grant execute on function public.notif_mark_all_read(uuid, uuid[]) to anon, authenticated;
