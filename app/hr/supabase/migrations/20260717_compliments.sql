-- Employee Recognition / Compliments — real backend for src/screens/Compliments.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, NO anon table policies —
-- every read/write goes through SECURITY DEFINER RPCs granted to anon + authenticated,
-- matching every sibling HR RPC (the app authenticates via pin_login and calls RPCs
-- under the anon role). HR is single-tenant; tenant is derived from org_nodes.
--
-- The pre-existing recognition table (id, tenant_id, node_id, note, created_at) is far
-- too thin for this screen (categories, approval workflow, per-kind reactions,
-- visibility, points, customer-sourced quotes, per-tenant system toggles and an
-- individual restriction list), so a dedicated compliments domain is created here.
-- The thin, phantom get_compliments(p_node_ids)/send_compliment(...) definitions that
-- existed in the DB (used ONLY by this screen) are dropped and rebuilt with a rich shape.

-- ── Drop the old thin/phantom overloads (any signature) ──────────────────────────
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname in ('get_compliments', 'send_compliment')
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- ── Tables ───────────────────────────────────────────────────────────────────────
create table if not exists public.compliments (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid,
  from_person_id      uuid,
  from_node_id        uuid,
  to_person_id        uuid,
  to_node_id          uuid,
  category            text not null default 'Teamwork',
  message             text not null,
  customer_quote      text,
  is_customer_sourced boolean not null default false,
  visibility          text not null default 'public',   -- public | private | manager-only
  status              text not null default 'pending',  -- pending | approved | rejected
  points              int  not null default 10,
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now()
);

create table if not exists public.compliment_reactions (
  id            uuid primary key default gen_random_uuid(),
  compliment_id uuid not null references public.compliments(id) on delete cascade,
  person_id     uuid not null,
  kind          text not null,                          -- clap | heart | star
  created_at    timestamptz not null default now()
);
create unique index if not exists compliment_reactions_uk
  on public.compliment_reactions (compliment_id, person_id, kind);

create table if not exists public.compliment_settings (
  tenant_id             uuid primary key,
  system_enabled        boolean not null default true,
  associates_can_submit boolean not null default true,
  updated_by            uuid,
  updated_at            timestamptz not null default now()
);

create table if not exists public.compliment_restrictions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid,
  person_id  uuid not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists compliment_restrictions_uk
  on public.compliment_restrictions (tenant_id, person_id);

create index if not exists compliments_to_node_idx   on public.compliments (to_node_id, created_at desc);
create index if not exists compliments_from_node_idx on public.compliments (from_node_id);
create index if not exists compliments_status_idx    on public.compliments (status);

alter table public.compliments             enable row level security;
alter table public.compliment_reactions    enable row level security;
alter table public.compliment_settings     enable row level security;
alter table public.compliment_restrictions enable row level security;

-- ── Read: rich feed, scoped by recipient OR sender node (empty scope => all) ───────
-- Visibility is enforced server-side: 'public' rows for everyone; 'private' and
-- 'manager-only' rows only for the sender, the recipient, or a manager (managers
-- must see everything to run the approval queue).
create or replace function public.get_compliments(
  p_node_ids   uuid[],
  p_viewer_id  uuid    default null,
  p_is_manager boolean default false
)
returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(t.row order by t.created_at desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'id',                  c.id,
        'from_id',             c.from_person_id,
        'sender_name',         coalesce(nullif(btrim(sp.display_name), ''), sp.full_name, 'Unknown'),
        'sender_loc',          sn.name,
        'recipient_id',        c.to_person_id,
        'recipient_name',      coalesce(nullif(btrim(rp.display_name), ''), rp.full_name, 'Unknown'),
        'recipient_loc',       rn.name,
        'category',            c.category,
        'message',             c.message,
        'customer_quote',      c.customer_quote,
        'is_customer_sourced', c.is_customer_sourced,
        'visibility',          c.visibility,
        'status',              c.status,
        'points',              c.points,
        'created_at',          c.created_at,
        'reactions',           jsonb_build_object(
          'clap',  coalesce(rx.clap,  0),
          'heart', coalesce(rx.heart, 0),
          'star',  coalesce(rx.star,  0)
        )
      ) as row,
      c.created_at
    from public.compliments c
    left join public.people    sp on sp.id = c.from_person_id
    left join public.people    rp on rp.id = c.to_person_id
    left join public.org_nodes sn on sn.id = c.from_node_id
    left join public.org_nodes rn on rn.id = c.to_node_id
    left join lateral (
      select
        count(*) filter (where cr.kind = 'clap')  as clap,
        count(*) filter (where cr.kind = 'heart') as heart,
        count(*) filter (where cr.kind = 'star')  as star
      from public.compliment_reactions cr
      where cr.compliment_id = c.id
    ) rx on true
    where (p_node_ids is null
       or array_length(p_node_ids, 1) is null
       or c.to_node_id   = any(p_node_ids)
       or c.from_node_id = any(p_node_ids))
      and (c.visibility = 'public'
       or coalesce(p_is_manager, false)
       or c.from_person_id = p_viewer_id
       or c.to_person_id   = p_viewer_id)
  ) t;
$$;
grant execute on function public.get_compliments(uuid[], uuid, boolean) to anon, authenticated;

-- ── Read: admin settings + restriction list ───────────────────────────────────────
create or replace function public.get_compliment_settings()
returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'systemEnabled',        coalesce((select system_enabled        from public.compliment_settings where tenant_id = t.tid), true),
    'associatesCanSubmit',  coalesce((select associates_can_submit from public.compliment_settings where tenant_id = t.tid), true),
    'bannedIds',            coalesce((select jsonb_agg(person_id)  from public.compliment_restrictions where tenant_id = t.tid), '[]'::jsonb)
  )
  from (select (select tenant_id from public.org_nodes order by tenant_id limit 1) as tid) t;
$$;
grant execute on function public.get_compliment_settings() to anon, authenticated;

-- ── Write: submit a compliment (enters as 'pending' for manager approval) ──────────
create or replace function public.send_compliment(
  p_from_id           uuid,
  p_to_id             uuid,
  p_category          text,
  p_message           text,
  p_visibility        text default 'public',
  p_customer_feedback text default null,
  p_from_node_id      uuid default null,
  p_to_node_id        uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_from_node uuid;
  v_to_node   uuid;
  v_tenant    uuid;
  v_points    int;
  v_enabled   boolean;
  v_assoc_ok  boolean;
  v_quote     text;
  v_id        uuid;
begin
  if p_to_id is null then
    return jsonb_build_object('ok', false, 'error', 'recipient_required');
  end if;
  if coalesce(btrim(p_message), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'message_required');
  end if;

  v_from_node := coalesce(p_from_node_id,
    (select node_id from public.assignments where person_id = p_from_id order by effective_from desc nulls last limit 1));
  v_to_node := coalesce(p_to_node_id,
    (select node_id from public.assignments where person_id = p_to_id order by effective_from desc nulls last limit 1));
  v_tenant := coalesce(
    (select tenant_id from public.org_nodes where id = coalesce(v_from_node, v_to_node)),
    (select tenant_id from public.org_nodes order by tenant_id limit 1));

  -- System gate
  select system_enabled into v_enabled from public.compliment_settings where tenant_id = v_tenant;
  if coalesce(v_enabled, true) = false then
    return jsonb_build_object('ok', false, 'error', 'system_disabled');
  end if;

  -- Individual restriction gate
  if exists (select 1 from public.compliment_restrictions where tenant_id = v_tenant and person_id = p_from_id) then
    return jsonb_build_object('ok', false, 'error', 'restricted');
  end if;

  -- Associate-submission gate: when the admin toggle is off, only Key Holders
  -- and above (role name matched against the sender's current assignment) may submit.
  select associates_can_submit into v_assoc_ok from public.compliment_settings where tenant_id = v_tenant;
  if coalesce(v_assoc_ok, true) = false then
    if not exists (
      select 1
      from public.assignments a
      join public.roles r on r.id = a.role_id
      where a.person_id = p_from_id
        and r.name ~* '(manager|key ?holder|lead|supervisor|director|admin|owner|ceo|coo|hr)'
    ) then
      return jsonb_build_object('ok', false, 'error', 'associates_disabled');
    end if;
  end if;

  v_points := case lower(coalesce(p_category, ''))
    when 'customer service' then 10
    when 'teamwork'         then 20
    when 'sales'            then 30
    when 'training'         then 40
    when 'leadership'       then 50
    when 'initiative'       then 60
    else 10 end;

  v_quote := nullif(btrim(coalesce(p_customer_feedback, '')), '');

  insert into public.compliments
    (tenant_id, from_person_id, from_node_id, to_person_id, to_node_id,
     category, message, customer_quote, is_customer_sourced, visibility, status, points)
  values
    (v_tenant, p_from_id, v_from_node, p_to_id, v_to_node,
     coalesce(nullif(btrim(p_category), ''), 'Teamwork'), btrim(p_message),
     v_quote, v_quote is not null, coalesce(nullif(btrim(p_visibility), ''), 'public'),
     'pending', v_points)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending');
end; $$;
grant execute on function public.send_compliment(uuid, uuid, text, text, text, text, uuid, uuid) to anon, authenticated;

-- ── Write: toggle a per-person reaction (clap/heart/star), returns fresh counts ────
create or replace function public.react_to_compliment(
  p_compliment_id uuid,
  p_person_id     uuid,
  p_kind          text
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'person_required');
  end if;
  if p_kind not in ('clap', 'heart', 'star') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;

  if exists (select 1 from public.compliment_reactions
             where compliment_id = p_compliment_id and person_id = p_person_id and kind = p_kind) then
    delete from public.compliment_reactions
      where compliment_id = p_compliment_id and person_id = p_person_id and kind = p_kind;
  else
    insert into public.compliment_reactions (compliment_id, person_id, kind)
      values (p_compliment_id, p_person_id, p_kind)
      on conflict (compliment_id, person_id, kind) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'reactions', jsonb_build_object(
    'clap',  (select count(*) from public.compliment_reactions where compliment_id = p_compliment_id and kind = 'clap'),
    'heart', (select count(*) from public.compliment_reactions where compliment_id = p_compliment_id and kind = 'heart'),
    'star',  (select count(*) from public.compliment_reactions where compliment_id = p_compliment_id and kind = 'star')
  ));
end; $$;
grant execute on function public.react_to_compliment(uuid, uuid, text) to anon, authenticated;

-- ── Write: manager approve / reject ───────────────────────────────────────────────
create or replace function public.review_compliment(
  p_id          uuid,
  p_action      text,
  p_reviewer_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_status text; v_id uuid;
begin
  v_status := case lower(coalesce(p_action, ''))
    when 'approve' then 'approved'
    when 'reject'  then 'rejected'
    else null end;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'bad_action');
  end if;

  update public.compliments
     set status = v_status, reviewed_by = p_reviewer_id, reviewed_at = now()
   where id = p_id
   returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
end; $$;
grant execute on function public.review_compliment(uuid, text, uuid) to anon, authenticated;

-- ── Write: admin toggles (system on/off, associate submissions) ────────────────────
create or replace function public.set_compliment_settings(
  p_system_enabled        boolean,
  p_associates_can_submit boolean,
  p_actor                 uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;
  insert into public.compliment_settings (tenant_id, system_enabled, associates_can_submit, updated_by, updated_at)
  values (v_tenant, coalesce(p_system_enabled, true), coalesce(p_associates_can_submit, true), p_actor, now())
  on conflict (tenant_id) do update set
    system_enabled        = excluded.system_enabled,
    associates_can_submit = excluded.associates_can_submit,
    updated_by            = excluded.updated_by,
    updated_at            = now();
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.set_compliment_settings(boolean, boolean, uuid) to anon, authenticated;

-- ── Write: restrict / unrestrict an individual from submitting ─────────────────────
create or replace function public.set_compliment_restriction(
  p_person_id uuid,
  p_restrict  boolean,
  p_actor     uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;
  if coalesce(p_restrict, false) then
    insert into public.compliment_restrictions (tenant_id, person_id, created_by)
    values (v_tenant, p_person_id, p_actor)
    on conflict (tenant_id, person_id) do nothing;
  else
    delete from public.compliment_restrictions where tenant_id = v_tenant and person_id = p_person_id;
  end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.set_compliment_restriction(uuid, boolean, uuid) to anon, authenticated;
