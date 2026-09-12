-- ═══════════════════════════════════════════════════════════════════════════
-- Gamification backend — real data for src/screens/Gamification.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- The screen previously faked EVERYTHING except a partial roster: employee
-- points lived in localStorage (lib/platform.js awardPoints/getPoints), and the
-- badge catalog, point rules, rewards catalog, redemptions, leaderboard points
-- and KPIs were hardcoded / Math-seeded arrays. This migration makes the whole
-- surface real and RPC-only, matching the app's pin_login → anon model
-- (RLS ON, no anon table policy; SECURITY DEFINER RPCs bypass it by design).
--
-- REUSED (verified live 2026-07-17, NOT touched):
--   get_gamification_profiles(p_node_ids)
--     -> (person_id, full_name, spiff_total, current_streak, longest_streak,
--         recognition_count)   — streak + recognition + spiff signal, reused
--         inside get_gamification_board via a FROM-clause call.
--   people(id, full_name, display_name, is_active)
--   assignments(person_id, node_id, role_id, effective_from, effective_to)
--   org_nodes(id, name, tenant_id, node_type)   roles(id, name)
--
-- NEW (this file): the points ledger, editable point-rule catalog, rewards
--   catalog, redemption queue, badge catalog + awards, and a budget setting —
--   plus the read board + write RPCs. Badge/rule/reward CATALOGS are seeded
--   (they are configuration the UI needs — the same constants formerly hardcoded
--   in the JSX). NO fake user activity is seeded: no points, no redemptions, no
--   badge awards — those surfaces render honest-empty until real events occur.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────────────────

-- Points transactions: the single source of truth for every employee balance.
create table if not exists public.gamification_points_ledger (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  node_id          uuid not null,
  person_id        uuid not null,
  points           numeric not null default 0,
  reason           text,
  category         text not null default 'Bonus',
  awarded_by       uuid,
  awarded_by_name  text,
  created_at       timestamptz not null default now()
);
create index if not exists gam_ledger_person_idx on public.gamification_points_ledger(person_id);
create index if not exists gam_ledger_node_idx   on public.gamification_points_ledger(node_id);
create index if not exists gam_ledger_created_idx on public.gamification_points_ledger(created_at);

-- Editable point-rule catalog (how points are earned).
create table if not exists public.gamification_rules (
  id          uuid primary key default gen_random_uuid(),
  action      text not null unique,
  category    text not null default 'General',
  points      numeric not null default 0,
  is_active   boolean not null default true,
  sort_order  int not null default 0
);

-- Rewards catalog (admin CRUD).
create table if not exists public.gamification_rewards (
  id            uuid primary key default gen_random_uuid(),
  icon          text default '🎁',
  name          text not null,
  description   text default '',
  cost          numeric not null default 0,
  category      text not null default 'Experience',
  availability  text not null default 'in-stock',
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- Redemption queue (real requests, approvable).
create table if not exists public.gamification_reward_redemptions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  node_id       uuid,
  person_id     uuid not null,
  reward_id     uuid,
  reward_name   text not null,
  cost          numeric not null default 0,
  status        text not null default 'Pending',
  requested_at  timestamptz not null default now(),
  reviewed_by   uuid,
  reviewed_at   timestamptz
);
create index if not exists gam_redemp_person_idx on public.gamification_reward_redemptions(person_id);
create index if not exists gam_redemp_status_idx on public.gamification_reward_redemptions(status);

-- Badge catalog (global config).
create table if not exists public.gamification_badges (
  code        text primary key,
  icon        text default '⭐',
  name        text not null,
  rarity      text not null default 'Common',
  description text default '',
  how_to      text default '',
  sort_order  int not null default 0
);

-- Which person earned which badge (real awards only).
create table if not exists public.gamification_badge_awards (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  person_id   uuid not null,
  badge_code  text not null references public.gamification_badges(code),
  node_id     uuid,
  awarded_by  uuid,
  awarded_at  timestamptz not null default now(),
  unique (person_id, badge_code)
);
create index if not exists gam_badge_award_person_idx on public.gamification_badge_awards(person_id);
create index if not exists gam_badge_award_at_idx      on public.gamification_badge_awards(awarded_at);

-- Program budget (single-row config; no-code editable later).
create table if not exists public.gamification_settings (
  id                    boolean primary key default true check (id),
  monthly_budget_points int not null default 50000
);

alter table public.gamification_points_ledger        enable row level security;
alter table public.gamification_rules                 enable row level security;
alter table public.gamification_rewards               enable row level security;
alter table public.gamification_reward_redemptions    enable row level security;
alter table public.gamification_badges                enable row level security;
alter table public.gamification_badge_awards          enable row level security;
alter table public.gamification_settings              enable row level security;

-- ── Seed configuration catalogs (config, NOT user activity) ──────────────────
insert into public.gamification_settings (id, monthly_budget_points)
values (true, 50000) on conflict (id) do nothing;

insert into public.gamification_badges (code, icon, name, rarity, description, how_to, sort_order) values
  ('b1','⭐','Perfect Week','Common','Zero callouts and no lates all week','Complete a full week with perfect attendance and no tardiness.',1),
  ('b2','📚','Training Ace','Common','Completed a training module','Finish any assigned training module.',2),
  ('b3','🏆','100% Month','Rare','Zero callouts for an entire month','Work a full calendar month with no callouts.',3),
  ('b4','💰','Sales Master','Rare','Top 3 in sales for the week','Rank in the top 3 employees by sales revenue for any week.',4),
  ('b5','🔥','Streak King','Epic','30-day perfect attendance streak','Maintain a 30-consecutive-day perfect attendance record.',5),
  ('b6','🥇','Contest Champion','Epic','Won a sales or performance contest','Be declared the winner of any company-run contest.',6),
  ('b7','5️⃣','Level 5','Common','Reached Level 5 — Go-Getter','Accumulate 3,500 points to reach Level 5.',7),
  ('b8','🎓','Gold Star Trainer','Rare','Trained a new hire who scored 4+ on review','Train a new employee who receives a 4 or 5 rating on their 30-day review.',8),
  ('b9','👑','VIP Legend','Legendary','Reached the pinnacle — Level 10','Accumulate 25,000 points to achieve Hall of Fame status.',9),
  ('b10','😊','Customer Hero','Common','Received a documented customer compliment','Have a customer compliment logged by a manager.',10),
  ('b11','📋','Policy Pro','Common','Acknowledged all active policies','Sign off on all required policy acknowledgements.',11),
  ('b12','🤝','Team Builder','Rare','Trained 3+ new hires successfully','Successfully onboard three or more new team members.',12)
on conflict (code) do nothing;

insert into public.gamification_rules (action, category, points, sort_order)
select v.action, v.category, v.points, v.ord from (values
  ('On time to shift','Attendance',10,1),
  ('Perfect attendance week','Attendance',50,2),
  ('Complete training module','Training',75,3),
  ('Sell items (per $100 in sales)','Sales',20,4),
  ('Win contest','Sales',200,5),
  ('Zero callouts month','Attendance',150,6),
  ('Acknowledge policy','Compliance',25,7),
  ('Train a new hire','Training',100,8),
  ('Get customer compliment','Service',30,9)
) as v(action, category, points, ord)
on conflict (action) do nothing;

insert into public.gamification_rewards (icon, name, description, cost, category, availability, sort_order)
select * from (values
  ('📅','First Pick Scheduling','Pick your shifts for 1 week before anyone else.',500,'Schedule Perks','in-stock',1),
  ('💳','$10 Gift Card','Amazon or Visa gift card — your choice.',1000,'Gift Cards','in-stock',2),
  ('🌴','Extra PTO Day','One additional paid day off.',2500,'VIP Privileges','limited',3),
  ('🚫','Skip a Task','Skip one assigned task (manager approval required).',300,'VIP Privileges','in-stock',4),
  ('🛍️','Swag Pack','Branded company merchandise bundle.',750,'Company Swag','limited',5),
  ('🚪','Early Release','Leave 1 hour early on one shift.',400,'Schedule Perks','in-stock',6),
  ('🍱','Free Lunch','Company-paid lunch on a shift of your choice.',600,'Experience','in-stock',7),
  ('🅿️','VIP Parking','Best parking spot for one week.',200,'Schedule Perks','in-stock',8),
  ('🎁','$25 Gift Card','Amazon or Visa gift card.',2000,'Gift Cards','limited',9),
  ('🏋️','Gym Membership Month','One month company-paid gym membership.',3000,'Experience','limited',10),
  ('👕','Premium VIP Hoodie','High-quality branded hoodie.',1500,'Company Swag','in-stock',11),
  ('🎯','Bonus Day Off (Paid)','A full extra paid day off, no PTO deducted.',4000,'VIP Privileges','limited',12)
) as v(icon, name, description, cost, category, availability, ord)
where not exists (select 1 from public.gamification_rewards);

-- ── Helper: resolve a person's primary node + tenant (most recent assignment) ─
create or replace function public._gam_person_node(p_person_id uuid)
returns table(node_id uuid, tenant_id uuid)
language sql stable security definer set search_path = public as $$
  select a.node_id, n.tenant_id
  from assignments a
  join org_nodes n on n.id = a.node_id
  where a.person_id = p_person_id
    and (a.effective_to is null or a.effective_to >= current_date)
  order by a.effective_from desc nulls last
  limit 1;
$$;

-- ── Read: the whole board (employees + catalogs + redemptions + stats) ───────
create or replace function public.get_gamification_board(p_node_ids uuid[] default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_scope     uuid[];
  v_employees jsonb;
  v_rules     jsonb;
  v_rewards   jsonb;
  v_badges    jsonb;
  v_redemp    jsonb;
  v_stats     jsonb;
  v_budget    int;
begin
  if p_node_ids is null or array_length(p_node_ids, 1) is null then
    select array_agg(id) into v_scope from org_nodes where node_type = 'location';
  else
    v_scope := p_node_ids;
  end if;
  v_scope := coalesce(v_scope, '{}'::uuid[]);

  select coalesce(monthly_budget_points, 50000) into v_budget
  from gamification_settings where id = true;
  v_budget := coalesce(v_budget, 50000);

  -- Employees in scope, one row per person, enriched with real points/badges.
  with base as (
    select distinct on (p.id)
      p.id                                       as person_id,
      p.full_name                                as full_name,
      coalesce(nullif(btrim(p.display_name), ''), p.full_name) as display_name,
      a.node_id                                  as node_id,
      n.name                                     as location,
      coalesce(r.name, '—')                      as role
    from people p
    join assignments a on a.person_id = p.id and a.node_id = any(v_scope)
      and (a.effective_to is null or a.effective_to >= current_date)
    join org_nodes n on n.id = a.node_id
    left join roles r on r.id = a.role_id
    where coalesce(p.is_active, true) = true
    order by p.id, a.effective_from desc nulls last
  ),
  prof as (
    -- get_gamification_profiles returns a scalar jsonb array (verified live),
    -- so expand it rather than treating it as a set-returning function.
    select (elem->>'person_id')::uuid        as person_id,
           (elem->>'spiff_total')::numeric   as spiff_total,
           (elem->>'current_streak')::numeric  as current_streak,
           (elem->>'longest_streak')::numeric  as longest_streak,
           (elem->>'recognition_count')::numeric as recognition_count
    from jsonb_array_elements(to_jsonb(get_gamification_profiles(v_scope))) as elem
  ),
  pts as (
    select person_id,
           coalesce(sum(points) filter (where created_at >= date_trunc('month', now())), 0) as mtd,
           coalesce(sum(points) filter (where created_at >= date_trunc('year',  now())), 0) as ytd,
           coalesce(sum(points), 0) as total
    from gamification_points_ledger
    group by person_id
  ),
  spent as (
    select person_id, coalesce(sum(cost), 0) as spent
    from gamification_reward_redemptions
    where status in ('Pending','Approved')
    group by person_id
  ),
  bdg as (
    select person_id, jsonb_agg(badge_code order by badge_code) as codes
    from gamification_badge_awards
    group by person_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',                b.person_id,
           'full_name',         b.full_name,
           'display_name',      b.display_name,
           'location',          b.location,
           'node_id',           b.node_id,
           'role',              b.role,
           'points_mtd',        coalesce(pts.mtd, 0),
           'points_ytd',        coalesce(pts.ytd, 0),
           'points_total',      coalesce(pts.total, 0),
           'redeemable',        greatest(0, coalesce(pts.total, 0) - coalesce(spent.spent, 0)),
           'streak',            coalesce(prof.current_streak, 0),
           'best_streak',       coalesce(prof.longest_streak, 0),
           'recognition_count', coalesce(prof.recognition_count, 0),
           'spiff_total',       coalesce(prof.spiff_total, 0),
           'badges',            coalesce(bdg.codes, '[]'::jsonb)
         ) order by b.full_name), '[]'::jsonb)
    into v_employees
  from base b
  left join prof  on prof.person_id  = b.person_id
  left join pts   on pts.person_id   = b.person_id
  left join spent on spent.person_id = b.person_id
  left join bdg   on bdg.person_id   = b.person_id;

  -- Point-rule catalog.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'action', action, 'category', category, 'points', points
         ) order by sort_order, action), '[]'::jsonb)
    into v_rules
  from gamification_rules where is_active;

  -- Rewards catalog.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'icon', icon, 'name', name, 'desc', description,
           'cost', cost, 'category', category, 'availability', availability
         ) order by sort_order, name), '[]'::jsonb)
    into v_rewards
  from gamification_rewards where is_active;

  -- Badge catalog + real holder counts.
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', gb.code, 'icon', gb.icon, 'name', gb.name, 'rarity', gb.rarity,
           'desc', gb.description, 'how_to', gb.how_to,
           'holder_count', coalesce(hc.cnt, 0)
         ) order by gb.sort_order), '[]'::jsonb)
    into v_badges
  from gamification_badges gb
  left join lateral (
    select count(distinct person_id)::int as cnt
    from gamification_badge_awards ga where ga.badge_code = gb.code
  ) hc on true;

  -- Redemptions within scope (joined to person location/name).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',          rr.id,
           'person_id',   rr.person_id,
           'person_name', coalesce(nullif(btrim(pe.display_name), ''), pe.full_name, 'Unknown'),
           'location',    ln.name,
           'reward_name', rr.reward_name,
           'cost',        rr.cost,
           'status',      rr.status,
           'date',        to_char(rr.requested_at, 'YYYY-MM-DD')
         ) order by rr.requested_at desc), '[]'::jsonb)
    into v_redemp
  from gamification_reward_redemptions rr
  join people pe on pe.id = rr.person_id
  left join org_nodes ln on ln.id = rr.node_id
  where rr.node_id = any(v_scope) or rr.node_id is null;

  -- Ledger / budget derived stats that cannot be computed from the arrays above.
  select jsonb_build_object(
           'points_today', (
             select coalesce(sum(points), 0) from gamification_points_ledger
             where node_id = any(v_scope) and created_at::date = current_date),
           'badges_week', (
             select count(*) from gamification_badge_awards
             where awarded_at >= now() - interval '7 days'),
           'total_reward_exposure', (
             select coalesce(sum(cost), 0) from gamification_rewards where is_active),
           'budget_used_month', (
             select coalesce(sum(points), 0) from gamification_points_ledger
             where node_id = any(v_scope) and category = 'Bonus'
               and created_at >= date_trunc('month', now())),
           'budget_limit', v_budget
         )
    into v_stats;

  return jsonb_build_object(
    'ok',          true,
    'employees',   v_employees,
    'rules',       v_rules,
    'rewards',     v_rewards,
    'badges',      v_badges,
    'redemptions', v_redemp,
    'stats',       v_stats
  );
end $$;

-- ── Read: one person's recent point history (activity feed) ──────────────────
create or replace function public.get_my_point_history(p_person_id uuid, p_limit int default 12)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',   id,
           'date', to_char(created_at, 'YYYY-MM-DD'),
           'desc', coalesce(reason, 'Points awarded'),
           'pts',  points
         ) order by created_at desc), '[]'::jsonb)
  from (
    select id, created_at, reason, points
    from gamification_points_ledger
    where person_id = p_person_id
    order by created_at desc
    limit greatest(1, coalesce(p_limit, 12))
  ) h;
$$;

-- ── Write: award points (manual bonus / rule payout) ─────────────────────────
create or replace function public.award_gamification_points(
  p_person_id  uuid,
  p_points     numeric,
  p_reason     text default null,
  p_category   text default 'Bonus',
  p_awarded_by uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_tenant uuid; v_name text; v_id uuid;
begin
  if p_person_id is null then raise exception 'person_id required'; end if;
  if coalesce(p_points, 0) = 0 then raise exception 'points must be non-zero'; end if;

  select node_id, tenant_id into v_node, v_tenant from _gam_person_node(p_person_id);
  if v_node is null then raise exception 'Employee has no active assignment'; end if;

  select coalesce(nullif(btrim(display_name), ''), full_name) into v_name
  from people where id = p_awarded_by;

  insert into public.gamification_points_ledger
    (tenant_id, node_id, person_id, points, reason, category, awarded_by, awarded_by_name)
  values (v_tenant, v_node, p_person_id, p_points,
          nullif(btrim(coalesce(p_reason, '')), ''),
          coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Bonus'),
          p_awarded_by, v_name)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ── Write: update a point rule's value ───────────────────────────────────────
create or replace function public.update_gamification_rule(p_id uuid, p_points numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.gamification_rules set points = coalesce(p_points, points) where id = p_id;
  if not found then raise exception 'Rule not found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── Write: add / update a reward ─────────────────────────────────────────────
create or replace function public.upsert_gamification_reward(
  p_id           uuid    default null,
  p_icon         text    default '🎁',
  p_name         text    default null,
  p_cost         numeric default 0,
  p_category     text    default 'Experience',
  p_desc         text    default '',
  p_availability text    default 'in-stock'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row public.gamification_rewards;
begin
  if coalesce(btrim(p_name), '') = '' then raise exception 'Reward name required'; end if;
  if p_id is null then
    insert into public.gamification_rewards (icon, name, description, cost, category, availability)
    values (coalesce(nullif(btrim(coalesce(p_icon,'')),''),'🎁'), btrim(p_name),
            coalesce(p_desc,''), greatest(0, coalesce(p_cost,0)),
            coalesce(nullif(btrim(coalesce(p_category,'')),''),'Experience'),
            coalesce(nullif(btrim(coalesce(p_availability,'')),''),'in-stock'))
    returning * into v_row;
  else
    update public.gamification_rewards set
      icon = coalesce(nullif(btrim(coalesce(p_icon,'')),''), icon),
      name = btrim(p_name),
      description = coalesce(p_desc, description),
      cost = greatest(0, coalesce(p_cost, cost)),
      category = coalesce(nullif(btrim(coalesce(p_category,'')),''), category),
      availability = coalesce(nullif(btrim(coalesce(p_availability,'')),''), availability)
    where id = p_id returning * into v_row;
    if not found then raise exception 'Reward not found'; end if;
  end if;
  return to_jsonb(v_row);
end $$;

-- ── Write: retire a reward (soft delete) ─────────────────────────────────────
create or replace function public.delete_gamification_reward(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.gamification_rewards set is_active = false where id = p_id;
  if not found then raise exception 'Reward not found'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── Write: redeem a reward (validates real balance, queues Pending) ──────────
create or replace function public.redeem_reward(
  p_person_id uuid,
  p_reward_id uuid,
  p_points    numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reward  public.gamification_rewards;
  v_node    uuid; v_tenant uuid;
  v_total   numeric; v_spent numeric; v_balance numeric;
  v_id      uuid;
begin
  select * into v_reward from public.gamification_rewards where id = p_reward_id and is_active;
  if not found then raise exception 'Reward not available'; end if;
  if v_reward.availability = 'sold-out' then raise exception 'Reward is sold out'; end if;

  select node_id, tenant_id into v_node, v_tenant from _gam_person_node(p_person_id);
  if v_tenant is null then raise exception 'Employee has no active assignment'; end if;

  select coalesce(sum(points), 0) into v_total
  from gamification_points_ledger where person_id = p_person_id;
  select coalesce(sum(cost), 0) into v_spent
  from gamification_reward_redemptions
  where person_id = p_person_id and status in ('Pending','Approved');
  v_balance := greatest(0, v_total - v_spent);

  if v_balance < v_reward.cost then
    raise exception 'Insufficient points (have %, need %)', v_balance, v_reward.cost;
  end if;

  insert into public.gamification_reward_redemptions
    (tenant_id, node_id, person_id, reward_id, reward_name, cost, status)
  values (v_tenant, v_node, p_person_id, v_reward.id, v_reward.name, v_reward.cost, 'Pending')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ── Write: approve / deny a redemption ───────────────────────────────────────
create or replace function public.review_reward_redemption(
  p_id uuid, p_action text, p_reviewer_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  v_status := case lower(coalesce(p_action, ''))
                when 'approve' then 'Approved'
                when 'deny'    then 'Denied'
                when 'reject'  then 'Denied'
                else null end;
  if v_status is null then raise exception 'Invalid action %', p_action; end if;
  update public.gamification_reward_redemptions
    set status = v_status, reviewed_by = p_reviewer_id, reviewed_at = now()
  where id = p_id and status = 'Pending';
  if not found then raise exception 'Redemption not found or already reviewed'; end if;
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

-- ── Grants (RPC-only access model) ───────────────────────────────────────────
grant execute on function public._gam_person_node(uuid) to anon, authenticated;
grant execute on function public.get_gamification_board(uuid[]) to anon, authenticated;
grant execute on function public.get_my_point_history(uuid, int) to anon, authenticated;
grant execute on function public.award_gamification_points(uuid, numeric, text, text, uuid) to anon, authenticated;
grant execute on function public.update_gamification_rule(uuid, numeric) to anon, authenticated;
grant execute on function public.upsert_gamification_reward(uuid, text, text, numeric, text, text, text) to anon, authenticated;
grant execute on function public.delete_gamification_reward(uuid) to anon, authenticated;
grant execute on function public.redeem_reward(uuid, uuid, numeric) to anon, authenticated;
grant execute on function public.review_reward_redemption(uuid, text, uuid) to anon, authenticated;
