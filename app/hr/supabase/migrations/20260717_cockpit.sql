-- ─────────────────────────────────────────────────────────────────────────────
-- Cockpit (Command Center) backend — 2026-07-17
-- Purpose: the two capabilities Cockpit.jsx needs that no existing RPC provides:
--   1. get_cockpit_sales(p_node_ids)  — per-node sales rollup (today / yesterday /
--      MTD + daily & monthly goals). get_sales_summary exists but aggregates
--      ACROSS nodes; the cockpit needs a per-location breakdown in one call.
--   2. get_current_wages(p_node_ids)  — latest wage per person in scope (bulk).
--      wage_history exists (RLS-locked, RPC-only) but only has a per-person
--      write RPC; the cockpit needs a bulk read for real labor-cost KPIs.
-- REUSES existing tables only (verified live 2026-07-17):
--   sales_logs(id, tenant_id, node_id, person_id, amount, units, category, sale_date, created_at)
--   sales_goals(id, tenant_id, node_id, person_id, period, metric, target_value,
--               start_date, end_date, description, created_by, created_at, updated_at)
--   wage_history(id, tenant_id, node_id, person_id, effective_date, new_wage, prior_wage, ...)
--   org_nodes(id, name, tenant_id)   assignments(person_id, node_id, role_id, effective_from)
-- NO new tables. Idempotent — safe to re-run. Matches the app's pin_login/anon
-- model (RLS ON, no anon policies; SECURITY DEFINER RPCs are the only read path).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 ── Per-node sales rollup ─────────────────────────────────────────────────
create or replace function public.get_cockpit_sales(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'node_id',          n.id,
        'node_name',        n.name,
        'today_amount',     coalesce(t.amt, 0),
        'today_txns',       coalesce(t.txns, 0),
        'today_units',      coalesce(t.units, 0),
        'yesterday_amount', coalesce(y.amt, 0),
        'yesterday_txns',   coalesce(y.txns, 0),
        'mtd_amount',       coalesce(m.amt, 0),
        'daily_goal',       g_day.target_value,
        'monthly_goal',     g_mon.target_value
      )
      order by n.name
    ),
    '[]'::jsonb
  )
  from org_nodes n
  left join lateral (
    select sum(s.amount) as amt, count(*) as txns, sum(coalesce(s.units, 0)) as units
    from sales_logs s
    where s.node_id = n.id and s.sale_date = current_date
  ) t on true
  left join lateral (
    select sum(s.amount) as amt, count(*) as txns
    from sales_logs s
    where s.node_id = n.id and s.sale_date = current_date - 1
  ) y on true
  left join lateral (
    select sum(s.amount) as amt
    from sales_logs s
    where s.node_id = n.id
      and s.sale_date >= date_trunc('month', current_date)::date
      and s.sale_date <= current_date
  ) m on true
  left join lateral (
    select g.target_value
    from sales_goals g
    where g.node_id = n.id
      and lower(coalesce(g.period, '')) like 'da%'          -- 'daily' / 'day'
      and (g.start_date is null or g.start_date <= current_date)
      and (g.end_date   is null or g.end_date   >= current_date)
    order by g.updated_at desc nulls last, g.created_at desc
    limit 1
  ) g_day on true
  left join lateral (
    select g.target_value
    from sales_goals g
    where g.node_id = n.id
      and lower(coalesce(g.period, '')) like 'month%'       -- 'monthly' / 'month'
      and (g.start_date is null or g.start_date <= current_date)
      and (g.end_date   is null or g.end_date   >= current_date)
    order by g.updated_at desc nulls last, g.created_at desc
    limit 1
  ) g_mon on true
  where n.id = any(p_node_ids);
$$;

revoke all on function public.get_cockpit_sales(uuid[]) from public;
grant execute on function public.get_cockpit_sales(uuid[]) to anon, authenticated;

-- 2 ── Bulk latest wage per person in scope ──────────────────────────────────
create or replace function public.get_current_wages(p_node_ids uuid[])
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'person_id',      w.person_id,
        'wage',           w.new_wage,
        'effective_date', to_char(w.effective_date, 'YYYY-MM-DD')
      )
    ),
    '[]'::jsonb
  )
  from (
    select distinct on (wh.person_id)
      wh.person_id, wh.new_wage, wh.effective_date
    from wage_history wh
    where exists (
      select 1 from assignments a
      where a.person_id = wh.person_id and a.node_id = any(p_node_ids)
    )
    order by wh.person_id, wh.effective_date desc, wh.created_at desc
  ) w;
$$;

revoke all on function public.get_current_wages(uuid[]) from public;
grant execute on function public.get_current_wages(uuid[]) to anon, authenticated;
