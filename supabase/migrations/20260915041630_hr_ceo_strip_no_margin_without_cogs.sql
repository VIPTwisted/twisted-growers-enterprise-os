-- BP-12g: September has $131,809 of revenue and $0 COGS because the tag ledger's sold events end on 6 Aug (Agent M's
-- backfill window) — a "100% gross margin" on the strip would be a lie. The margin is NULL while the month has no
-- COGS, and the strip carries ledger_last_sold_at so the screen can say why.
set search_path = public;
create or replace function hr.tg_company_kpi_strip()
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  with mtd as (select sum(revenue) revenue, sum(cogs) cogs, sum(gross_margin) gross_margin, bool_or(cogs_indicative) cogs_indicative, max(how_to_read_it) how_to_read_it
                 from public.v_pnl_live where month = date_trunc('month', current_date)::date and book <> 'memo'),
       lm  as (select sum(revenue) revenue from public.v_pnl_live where month = (date_trunc('month', current_date) - interval '1 month')::date and book <> 'memo'),
       cpp as (select * from public.v_cost_per_pound_journal where month = date_trunc('month', current_date)::date limit 1),
       ct  as (select jsonb_object_agg(metric, value) m from public.v_control_tower where metric in ('bought_in_overdue', 'bought_in_on_hand_lb', 'onboarding_blockers_open', 'onboarding_steps_open')),
       led as (select max(j.event_at) last_sold from public.journal j where j.rule_key in ('sold_cogs', 'sold_cogs_bought_in'))
  select jsonb_build_object(
    'as_of', now(),
    'month', to_char(current_date, 'Mon YYYY'),
    'revenue_mtd', coalesce((select revenue from mtd), 0),
    'revenue_last_month', coalesce((select revenue from lm), 0),
    'cogs_mtd', coalesce((select cogs from mtd), 0),
    'gross_margin_mtd', case when coalesce((select cogs from mtd), 0) > 0 then (select gross_margin from mtd) end,
    'gross_margin_pct', case when coalesce((select revenue from mtd), 0) > 0 and coalesce((select cogs from mtd), 0) > 0 and (select gross_margin from mtd) is not null then round(100 * (select gross_margin from mtd) / (select revenue from mtd), 1) end,
    'cogs_indicative', coalesce((select cogs_indicative from mtd), false),
    'ledger_last_sold_at', (select last_sold from led),
    'orders_mtd', (select count(*) from public.journal j where j.rule_key = 'sold_revenue' and j.event_kind <> 'reprice' and date_trunc('month', j.event_at)::date = date_trunc('month', current_date)::date),
    'lb_sold_mtd', round(coalesce((select lb_sold from cpp), 0), 1),
    'labour_posted_mtd', coalesce((select cost_posted_usd from cpp), 0),
    'bought_in_overdue', coalesce(((select m from ct)->>'bought_in_overdue')::numeric, 0),
    'bought_in_on_hand_lb', coalesce(((select m from ct)->>'bought_in_on_hand_lb')::numeric, 0),
    'onboarding_blockers_open', coalesce(((select m from ct)->>'onboarding_blockers_open')::numeric, 0),
    'onboarding_steps_open', coalesce(((select m from ct)->>'onboarding_steps_open')::numeric, 0),
    'people_active', (select count(*) from public.employees where status = 'active'),
    'on_shift_today', (select count(distinct s.person_id) from hr.shifts s where s.status = 'posted' and s.shift_date = current_date),
    'how_to_read_it', case when coalesce((select cogs from mtd), 0) = 0 and coalesce((select revenue from mtd), 0) > 0
                           then 'Revenue is on the spine for this month; no COGS has posted because the tag ledger''s sold events end ' || to_char((select last_sold from led), 'DD Mon YYYY') || ' — the margin is not shown until they catch up.'
                           else coalesce((select how_to_read_it from mtd), 'No journal rows this month yet — the money spine posts every minute from tag events and Apex orders.') end
  )
$$;
notify pgrst, 'reload schema';;
