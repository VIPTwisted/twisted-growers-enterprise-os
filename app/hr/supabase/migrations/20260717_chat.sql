-- Team Chat — real backend for src/screens/Chat.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated
-- (the app authenticates via pin_login and calls RPCs under the anon role,
-- exactly like every sibling HR RPC: shift_notes, greetings, etc.).
--
-- Design notes
--   * CHANNELS are NOT a seeded table. Company channels are a fixed catalog
--     (general / announcements / scheduling / training / manager-chat) and
--     location channels are derived live from real org_nodes rows. No fake
--     rows are ever inserted — chat_messages starts genuinely empty and stays
--     an honest empty state until real users post.
--   * DIRECT MESSAGES reuse the pre-existing real backend: get_messages(p_person_id)
--     + send_dm(p_from_id, p_to_id, p_body). This migration does NOT touch those.
--   * A channel_key is text: 'general' | 'announcements' | 'scheduling' |
--     'training' | 'manager-chat' | 'loc:<org_node uuid>'.

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  channel_key  text not null,
  node_id      uuid,                         -- set for 'loc:<uuid>' channels
  parent_id    uuid references public.chat_messages(id) on delete cascade, -- thread reply
  sender_id    uuid,
  sender_name  text,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists chat_messages_channel_idx on public.chat_messages (channel_key, created_at desc);
create index if not exists chat_messages_parent_idx  on public.chat_messages (parent_id, created_at);
alter table public.chat_messages enable row level security;

create table if not exists public.chat_reactions (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.chat_messages(id) on delete cascade,
  person_id    uuid,
  person_name  text,
  emoji        text not null,
  created_at   timestamptz not null default now()
);
create unique index if not exists chat_reactions_uk on public.chat_reactions (message_id, person_id, emoji);
alter table public.chat_reactions enable row level security;

create table if not exists public.chat_read_state (
  person_id     uuid not null,
  channel_key   text not null,
  last_read_at  timestamptz not null default now(),
  primary key (person_id, channel_key)
);
alter table public.chat_read_state enable row level security;

-- ── Reusable: reactions for one message as [{emoji,count,users}] ──────────────
create or replace function public.chat_reactions_json(p_message_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.cnt, 'users', r.users) order by r.emoji),
    '[]'::jsonb)
  from (
    select emoji, count(*)::int as cnt,
           jsonb_agg(coalesce(person_name, 'Someone')) as users
    from public.chat_reactions
    where message_id = p_message_id
    group by emoji
  ) r;
$$;
grant execute on function public.chat_reactions_json(uuid) to anon, authenticated;

-- ── Read: channel catalog (company + live per-location) with member/unread ────
create or replace function public.get_chat_channels(
  p_person_id uuid,
  p_node_ids  uuid[]
) returns jsonb language sql security definer set search_path = public as $$
  with company(channel_key, label, description, restricted, category, sort) as (
    values
      ('general',      '#general',       'All staff — company-wide updates',    false, 'channels', 1),
      ('announcements','#announcements',  'Official company announcements',      false, 'channels', 2),
      ('scheduling',   '#scheduling',     'Shift swaps, coverage requests',      false, 'channels', 3),
      ('training',     '#training',       'Training resources & reminders',      false, 'channels', 4),
      ('manager-chat', '#manager-chat',   'Managers & above',                    true,  'channels', 5)
  ),
  locs as (
    select
      'loc:' || n.id::text as channel_key,
      '#' || regexp_replace(lower(coalesce(n.name, 'team')), '\s+', '-', 'g') || '-team' as label,
      coalesce(n.name, 'Location') || ' location team' as description,
      false as restricted,
      'channels'::text as category,
      10 as sort,
      n.id as node_id
    from public.org_nodes n
    where p_node_ids is not null and n.id = any(p_node_ids)
  ),
  all_ch as (
    select channel_key, label, description, restricted, category, sort, null::uuid as node_id from company
    union all
    select channel_key, label, description, restricted, category, sort, node_id from locs
  )
  select coalesce(jsonb_agg(to_jsonb(c) - 'sort' order by c.sort, c.label), '[]'::jsonb)
  from (
    select
      a.channel_key, a.label, a.description, a.restricted, a.category, a.node_id, a.sort,
      -- member count
      case
        when a.node_id is not null then (
          select count(distinct asg.person_id)::int
          from public.assignments asg
          join public.people p on p.id = asg.person_id
          where asg.node_id = a.node_id and coalesce(p.is_active, true)
        )
        else (select count(*)::int from public.people p where coalesce(p.is_active, true))
      end as member_count,
      -- last top-level message preview
      lm.body       as last_body,
      lm.created_at as last_at,
      lm.sender_name as last_sender,
      -- unread top-level messages not authored by me since my last read
      (
        select count(*)::int
        from public.chat_messages m
        where m.channel_key = a.channel_key
          and m.parent_id is null
          and (m.sender_id is distinct from p_person_id)
          and m.created_at > coalesce(
            (select rs.last_read_at from public.chat_read_state rs
             where rs.person_id = p_person_id and rs.channel_key = a.channel_key),
            timestamptz 'epoch')
      ) as unread_count
    from all_ch a
    left join lateral (
      select body, created_at, sender_name
      from public.chat_messages m
      where m.channel_key = a.channel_key and m.parent_id is null
      order by m.created_at desc
      limit 1
    ) lm on true
  ) c;
$$;
grant execute on function public.get_chat_channels(uuid, uuid[]) to anon, authenticated;

-- ── Read: top-level messages for a channel (with reactions + reply_count) ─────
create or replace function public.get_chat_messages(
  p_channel_key text,
  p_limit int default 200
) returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at asc), '[]'::jsonb)
  from (
    select
      m.id, m.channel_key, m.node_id, m.sender_id, m.sender_name,
      m.body as message, m.created_at,
      public.chat_reactions_json(m.id) as reactions,
      (select count(*)::int from public.chat_messages c where c.parent_id = m.id) as reply_count
    from public.chat_messages m
    where m.channel_key = p_channel_key and m.parent_id is null
    order by m.created_at desc
    limit greatest(coalesce(p_limit, 200), 1)
  ) t;
$$;
grant execute on function public.get_chat_messages(text, int) to anon, authenticated;

-- ── Read: thread replies for a parent message ────────────────────────────────
create or replace function public.get_chat_thread(p_parent_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at asc), '[]'::jsonb)
  from (
    select m.id, m.parent_id, m.sender_id, m.sender_name, m.body as message, m.created_at,
           public.chat_reactions_json(m.id) as reactions
    from public.chat_messages m
    where m.parent_id = p_parent_id
    order by m.created_at asc
  ) t;
$$;
grant execute on function public.get_chat_thread(uuid) to anon, authenticated;

-- ── Write: post a channel message (or a thread reply when p_parent_id set) ────
create or replace function public.chat_send_message(
  p_channel_key text,
  p_sender_id   uuid,
  p_sender_name text,
  p_body        text,
  p_node_id     uuid default null,
  p_parent_id   uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid; v_node uuid;
begin
  if coalesce(length(btrim(p_body)), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'empty message');
  end if;
  if p_channel_key is null then
    return jsonb_build_object('ok', false, 'error', 'channel required');
  end if;

  -- derive node from 'loc:<uuid>' key if not supplied
  v_node := p_node_id;
  if v_node is null and p_channel_key like 'loc:%' then
    begin v_node := substring(p_channel_key from 5)::uuid; exception when others then v_node := null; end;
  end if;

  if v_node is not null then
    select tenant_id into v_tenant from public.org_nodes where id = v_node limit 1;
  end if;
  if v_tenant is null then
    select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1; -- HR is single-tenant
  end if;

  insert into public.chat_messages (tenant_id, channel_key, node_id, parent_id, sender_id, sender_name, body)
  values (v_tenant, p_channel_key, v_node, p_parent_id, p_sender_id,
          nullif(btrim(coalesce(p_sender_name, '')), ''), btrim(p_body))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'message', (
    select row_to_json(t) from (
      select m.id, m.channel_key, m.node_id, m.parent_id, m.sender_id, m.sender_name,
             m.body as message, m.created_at,
             '[]'::jsonb as reactions, 0 as reply_count
      from public.chat_messages m where m.id = v_id
    ) t
  ));
end;
$$;
grant execute on function public.chat_send_message(text, uuid, text, text, uuid, uuid) to anon, authenticated;

-- ── Write: toggle a reaction; returns the message's reactions afterward ───────
create or replace function public.chat_toggle_reaction(
  p_message_id  uuid,
  p_person_id   uuid,
  p_person_name text,
  p_emoji       text
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_message_id is null or coalesce(btrim(p_emoji), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'message and emoji required');
  end if;

  delete from public.chat_reactions
   where message_id = p_message_id and person_id is not distinct from p_person_id and emoji = p_emoji;

  if not found then
    insert into public.chat_reactions (message_id, person_id, person_name, emoji)
    values (p_message_id, p_person_id, nullif(btrim(coalesce(p_person_name, '')), ''), p_emoji)
    on conflict (message_id, person_id, emoji) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'reactions', public.chat_reactions_json(p_message_id));
end;
$$;
grant execute on function public.chat_toggle_reaction(uuid, uuid, text, text) to anon, authenticated;

-- ── Write: mark a channel read up to now (drives unread badges) ───────────────
create or replace function public.chat_mark_read(
  p_channel_key text,
  p_person_id   uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_person_id is null or p_channel_key is null then
    return jsonb_build_object('ok', false);
  end if;
  insert into public.chat_read_state (person_id, channel_key, last_read_at)
  values (p_person_id, p_channel_key, now())
  on conflict (person_id, channel_key) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.chat_mark_read(text, uuid) to anon, authenticated;
