-- Contests — real backend for src/screens/Contests.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. No table policies for anon — every
-- read/write goes through SECURITY DEFINER RPCs granted to anon + authenticated
-- (the app authenticates via pin_login and calls RPCs under the anon role).
--
-- What already exists and is REUSED (not touched):
--   sales_contests (id, tenant_id, node_id, title, description, metric, prize,
--                   start_date, end_date, is_active, created_by, created_at)
--   get_contests(p_node_ids)                          -> contest list (verified live)
--   get_contest_leaderboard(p_contest_id, p_node_ids) -> (rank, person_id,
--                   person_name, total_amount, sale_count) (verified live)
--   sales_logs (id, tenant_id, node_id, person_id, sale_date, amount, units,
--               category, created_at)
--   people / org_nodes / assignments / roles
--
-- What was BROKEN: create_contest(...) existed but never set tenant_id, so every
-- insert failed the NOT NULL constraint (verified live: SQLSTATE 23502). It also
-- discarded prize_amount / winner_count / min_hours / target / budget_code.
-- It is rebuilt below with the SAME call-site parameter names (plus optional
-- p_description / p_created_by) and a derived tenant.
--
-- What is NEW: metadata columns on sales_contests (additive, nullable/defaulted)
-- and get_contest_stats(p_node_ids) — participation, eligibility, per-location
-- rollups and computed winners for ended contests, all from real rows.

-- ── 1. Extend sales_contests (additive, idempotent) ──────────────────────────
alter table public.sales_contests add column if not exists contest_type   text;
alter table public.sales_contests add column if not exists category       text;
alter table public.sales_contests add column if not exists target         numeric;
alter table public.sales_contests add column if not exists prize_amount   numeric not null default 0;
alter table public.sales_contests add column if not exists winner_count   int     not null default 1;
alter table public.sales_contests add column if not exists min_hours      numeric not null default 0;
alter table public.sales_contests add column if not exists roles_eligible text;
alter table public.sales_contests add column if not exists budget_code    text;
alter table public.sales_contests add column if not exists node_ids       uuid[];

create index if not exists sales_contests_dates_idx
  on public.sales_contests (start_date, end_date);

alter table public.sales_contests enable row level security;

-- ── 2. Rebuild create_contest (drop every old overload first) ────────────────
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname = 'create_contest'
      and pronamespace = 'public'::regnamespace
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create or replace function public.create_contest(
  p_name         text,
  p_type         text    default 'Individual',
  p_category     text    default null,
  p_metric       text    default 'revenue',
  p_target       numeric default null,
  p_prize_amount numeric default 0,
  p_prize_desc   text    default '',
  p_winner_count int     default 1,
  p_start_date   date    default current_date,
  p_end_date     date    default current_date + 21,
  p_node_ids     uuid[]  default null,
  p_roles        text    default 'All Staff',
  p_min_hours    numeric default 0,
  p_budget_code  text    default null,
  p_description  text    default null,
  p_created_by   uuid    default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_row    public.sales_contests;
begin
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Contest name is required';
  end if;
  if p_end_date <= p_start_date then
    raise exception 'End date must be after start date';
  end if;

  -- Derive tenant from the eligible locations; HR is single-tenant, so fall
  -- back to the org tree's tenant when no nodes are supplied.
  select n.tenant_id into v_tenant
  from public.org_nodes n
  where p_node_ids is not null and n.id = any(p_node_ids) and n.tenant_id is not null
  limit 1;
  if v_tenant is null then
    select n.tenant_id into v_tenant
    from public.org_nodes n
    where n.tenant_id is not null
    limit 1;
  end if;
  if v_tenant is null then
    raise exception 'No tenant configured — cannot create contest';
  end if;

  insert into public.sales_contests (
    tenant_id, node_id, node_ids, title, description, metric, prize,
    prize_amount, start_date, end_date, is_active, created_by,
    contest_type, category, target, winner_count, min_hours,
    roles_eligible, budget_code
  ) values (
    v_tenant,
    case when p_node_ids is not null and array_length(p_node_ids, 1) = 1
         then p_node_ids[1] end,
    case when p_node_ids is not null and array_length(p_node_ids, 1) >= 1
         then p_node_ids end,
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    coalesce(nullif(btrim(p_metric), ''), 'revenue'),
    coalesce(nullif(btrim(coalesce(p_prize_desc, '')), ''),
             case when coalesce(p_prize_amount, 0) > 0
                  then '$' || trim(to_char(p_prize_amount, 'FM999999990.##'))
                  else 'TBD' end),
    greatest(0, coalesce(p_prize_amount, 0)),
    p_start_date,
    p_end_date,
    true,
    p_created_by,
    coalesce(nullif(btrim(coalesce(p_type, '')), ''), 'Individual'),
    nullif(btrim(coalesce(p_category, '')), ''),
    p_target,
    greatest(1, coalesce(p_winner_count, 1)),
    greatest(0, coalesce(p_min_hours, 0)),
    coalesce(nullif(btrim(coalesce(p_roles, '')), ''), 'All Staff'),
    nullif(btrim(coalesce(p_budget_code, '')), '')
  )
  returning * into v_row;

  return to_jsonb(v_row);
end $$;

-- ── 3. get_contest_stats — enrichment + per-location rollup (all real) ───────
create or replace function public.get_contest_stats(
  p_node_ids uuid[] default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_scope     uuid[];
  v_contests  jsonb;
  v_locations jsonb;
begin
  if p_node_ids is null or array_length(p_node_ids, 1) is null then
    select array_agg(id) into v_scope
    from public.org_nodes
    where node_type = 'location';
  else
    v_scope := p_node_ids;
  end if;
  v_scope := coalesce(v_scope, '{}'::uuid[]);

  -- Per-contest enrichment. A contest's eligible nodes = node_ids, else
  -- [node_id], else NULL (= company-wide).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',                c.id,
           'contest_type',      c.contest_type,
           'category',          c.category,
           'target',            c.target,
           'prize_amount',      c.prize_amount,
           'winner_count',      c.winner_count,
           'min_hours',         c.min_hours,
           'roles_eligible',    c.roles_eligible,
           'budget_code',       c.budget_code,
           'node_names',        nm.names,
           'participant_count', st.participant_count,
           'eligible_count',    el.eligible_count,
           'winner',            w.winner
         )), '[]'::jsonb)
    into v_contests
  from public.sales_contests c
  cross join lateral (
    select coalesce(c.node_ids,
                    case when c.node_id is not null then array[c.node_id] end) as ids
  ) cn
  left join lateral (
    select coalesce(jsonb_agg(n.name order by n.name), '[]'::jsonb) as names
    from public.org_nodes n
    where cn.ids is not null and n.id = any(cn.ids)
  ) nm on true
  left join lateral (
    select count(distinct sl.person_id)::int as participant_count
    from public.sales_logs sl
    where sl.sale_date between c.start_date and c.end_date
      and sl.node_id = any(v_scope)
      and (cn.ids is null or sl.node_id = any(cn.ids))
  ) st on true
  left join lateral (
    select count(distinct a.person_id)::int as eligible_count
    from public.assignments a
    join public.people p on p.id = a.person_id and p.is_active
    where a.node_id = any(v_scope)
      and (a.effective_to is null or a.effective_to >= current_date)
      and (cn.ids is null or a.node_id = any(cn.ids))
  ) el on true
  left join lateral (
    -- Winner is only computed for ended contests, straight from sales_logs.
    select jsonb_build_object(
             'person_id',   x.person_id,
             'person_name', coalesce(nullif(btrim(coalesce(p.display_name, '')), ''),
                                     p.full_name, 'Unknown'),
             'location',    loc.name,
             'score',       x.score
           ) as winner
    from (
      select sl.person_id,
             case c.metric
               when 'units'      then sum(coalesce(sl.units, 0))::numeric
               when 'avg_ticket' then round(avg(sl.amount), 2)
               else                   sum(sl.amount)
             end as score
      from public.sales_logs sl
      where c.end_date < current_date
        and sl.sale_date between c.start_date and c.end_date
        and sl.node_id = any(v_scope)
        and (cn.ids is null or sl.node_id = any(cn.ids))
      group by sl.person_id
      order by 2 desc
      limit 1
    ) x
    join public.people p on p.id = x.person_id
    left join lateral (
      select n.name
      from public.sales_logs sl2
      join public.org_nodes n on n.id = sl2.node_id
      where sl2.person_id = x.person_id
        and sl2.sale_date between c.start_date and c.end_date
      group by n.name
      order by sum(sl2.amount) desc
      limit 1
    ) loc on true
  ) w on true
  where cn.ids is null or cn.ids && v_scope;

  -- Per-location rollup: active contest count, quarter-to-date sellers and
  -- average sale, and wins this quarter (ended contests whose computed winner
  -- sold most at this location during the contest window).
  select coalesce(jsonb_agg(jsonb_build_object(
           'node_id',       n.id,
           'location',      n.name,
           'active',        act.cnt,
           'sellers_qtd',   pt.sellers,
           'avg_sale_qtd',  pt.avg_amt,
           'wins_this_qtr', wq.cnt
         ) order by n.name), '[]'::jsonb)
    into v_locations
  from public.org_nodes n
  left join lateral (
    select count(*)::int as cnt
    from public.sales_contests c
    cross join lateral (
      select coalesce(c.node_ids,
                      case when c.node_id is not null then array[c.node_id] end) as ids
    ) cn
    where c.is_active
      and c.start_date <= current_date
      and c.end_date   >= current_date
      and (cn.ids is null or n.id = any(cn.ids))
  ) act on true
  left join lateral (
    select count(distinct sl.person_id)::int as sellers,
           round(avg(sl.amount), 2)          as avg_amt
    from public.sales_logs sl
    where sl.node_id = n.id
      and sl.sale_date >= date_trunc('quarter', current_date)::date
  ) pt on true
  left join lateral (
    select count(*)::int as cnt
    from public.sales_contests c
    where c.end_date <  current_date
      and c.end_date >= date_trunc('quarter', current_date)::date
      and n.id = (
        select sl.node_id
        from public.sales_logs sl
        where sl.sale_date between c.start_date and c.end_date
          and sl.person_id = (
            select sl2.person_id
            from public.sales_logs sl2
            where sl2.sale_date between c.start_date and c.end_date
              and sl2.node_id = any(v_scope)
            group by sl2.person_id
            order by (case c.metric
                        when 'units'      then sum(coalesce(sl2.units, 0))::numeric
                        when 'avg_ticket' then avg(sl2.amount)
                        else                   sum(sl2.amount)
                      end) desc
            limit 1
          )
        group by sl.node_id
        order by sum(sl.amount) desc
        limit 1
      )
  ) wq on true
  where n.id = any(v_scope);

  return jsonb_build_object(
    'ok',        true,
    'contests',  v_contests,
    'locations', v_locations
  );
end $$;

-- ── 4. Grants (RPC-only access model, same as every sibling HR RPC) ──────────
grant execute on function public.create_contest(text, text, text, text, numeric,
  numeric, text, int, date, date, uuid[], text, numeric, text, text, uuid)
  to anon, authenticated;
grant execute on function public.get_contest_stats(uuid[])
  to anon, authenticated;
