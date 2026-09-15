-- BP-12g: the HR platform's CEO screen carried two VIP leftovers on production — a "Company — CEO Platform" strip that
-- called ceo_company_kpi_strip on the VIP CEO brain through an anonymous client (it failed and hid itself) and a
-- "CEO Platform — All Modules" launcher whose registry read failed (anonymous) and fell back to ~120 VIP modules
-- linking to vip-ceo-platform.netlify.app. Zero VIP data, never two companies: both now read Twisted Growers'
-- own rows through the signed-in HR client — the company strip from the money spine (BP-6) and the launcher from
-- the OS nav registry. Aggregates only; authenticated only.
set search_path = public;

create or replace function hr.tg_company_kpi_strip()
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  with mtd as (select * from public.v_pnl_live where month = date_trunc('month', current_date)::date and book <> 'memo' limit 1),
       lm  as (select * from public.v_pnl_live where month = (date_trunc('month', current_date) - interval '1 month')::date and book <> 'memo' limit 1),
       cpp as (select * from public.v_cost_per_pound_journal where month = date_trunc('month', current_date)::date limit 1),
       ct  as (select jsonb_object_agg(metric, value) m from public.v_control_tower where metric in ('bought_in_overdue', 'bought_in_on_hand_lb', 'onboarding_blockers_open', 'onboarding_steps_open'))
  select jsonb_build_object(
    'as_of', now(),
    'month', to_char(current_date, 'Mon YYYY'),
    'revenue_mtd', coalesce((select revenue from mtd), 0),
    'revenue_last_month', coalesce((select revenue from lm), 0),
    'cogs_mtd', coalesce((select cogs from mtd), 0),
    'gross_margin_mtd', (select gross_margin from mtd),
    'gross_margin_pct', case when coalesce((select revenue from mtd), 0) > 0 and (select gross_margin from mtd) is not null then round(100 * (select gross_margin from mtd) / (select revenue from mtd), 1) end,
    'cogs_indicative', coalesce((select cogs_indicative from mtd), false),
    'orders_mtd', (select count(*) from public.journal j where j.rule_key = 'sold_revenue' and j.event_kind <> 'reprice' and date_trunc('month', j.event_at)::date = date_trunc('month', current_date)::date),
    'lb_sold_mtd', round(coalesce((select lb_sold from cpp), 0), 1),
    'labour_posted_mtd', coalesce((select cost_posted_usd from cpp), 0),
    'bought_in_overdue', coalesce(((select m from ct)->>'bought_in_overdue')::numeric, 0),
    'bought_in_on_hand_lb', coalesce(((select m from ct)->>'bought_in_on_hand_lb')::numeric, 0),
    'onboarding_blockers_open', coalesce(((select m from ct)->>'onboarding_blockers_open')::numeric, 0),
    'onboarding_steps_open', coalesce(((select m from ct)->>'onboarding_steps_open')::numeric, 0),
    'people_active', (select count(*) from public.employees where status = 'active'),
    'on_shift_today', (select count(distinct s.person_id) from hr.shifts s where s.status = 'posted' and s.shift_date = current_date),
    'how_to_read_it', coalesce((select how_to_read_it from mtd), 'No journal rows this month yet — the money spine posts every minute from tag events and Apex orders.')
  )
$$;
revoke all on function hr.tg_company_kpi_strip() from public, anon;
grant execute on function hr.tg_company_kpi_strip() to authenticated, service_role;
comment on function hr.tg_company_kpi_strip() is 'BP-12g: the company strip on the HR CEO screen — Twisted Growers'' own figures from the money spine (v_pnl_live, v_cost_per_pound_journal, v_control_tower). Aggregates only.';

create or replace function hr.tg_os_modules()
returns table (category text, label text, view_key text, description text, icon text, sort int)
language sql stable security definer set search_path = hr, public, extensions as $$
  select n.category, n.label, n.view_key, n.description, n.icon, (coalesce(n.category_order, 99) * 1000 + coalesce(n.item_order, 999))::int
    from public.nav_registry n
   where n.enabled and n.surface in ('side', 'launcher') and n.category is not null
   order by 6, n.label;
$$;
revoke all on function hr.tg_os_modules() from public, anon;
grant execute on function hr.tg_os_modules() to authenticated, service_role;
comment on function hr.tg_os_modules() is 'BP-12g: the OS modules the HR CEO screen links to — the enabled side-menu and launcher rows of public.nav_registry, nothing hardwired.';
notify pgrst, 'reload schema';;
