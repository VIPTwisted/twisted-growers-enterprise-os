-- Owner ruling, 14 Sep 2026 (in his words): bought-in material "is inventoried as product/processing materials that we
-- buy and need to track and turn around and sell in 30-45 days. Must be tracked this way site wide — major daily items."
-- Part A: the bought-in register (every package whose item came from another licence), its turnaround against the
-- two rules as ROWS (target 30 days, limit 45), the queue page, the Inventory dashboard tiles, and a watch that files
-- a finding the moment a package passes its limit — which lands on Today as one decision.
-- Correction recorded here too: the money spine's "third-party receipts" were tag_event 'received' rows, and those
-- are OUR outbound deliveries being accepted by the counterparty (lab or customer), not material we bought. Bought-in
-- material is the package mirror's ItemFromFacilityLicenseNumber ≠ ours: 572 packages since Jan 2024 from 36 suppliers,
-- 131 on hand today. No purchase price is on file for any of them — the Purchases table is empty — so the register
-- says so per package and the watch files it.
set search_path = public;

insert into public.conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, updated_at, note)
values
 ('bought_in_turnaround_target_days', 30, 'days', 'Bought-in material: target days to turn', 'A package we bought (flower, trim, concentrate, product) should be sold or consumed within this many days of receipt.', 'Owner ruling 14 Sep 2026: "turn around and sell it in 30-45 days".', 'owner', now(), 'The lower bound of the owner''s 30–45 day window. Edit here; every page reads it.'),
 ('bought_in_turnaround_max_days', 45, 'days', 'Bought-in material: limit days to turn', 'Past this many days a bought-in package is overdue — a finding is filed and it lands on Today.', 'Owner ruling 14 Sep 2026: "turn around and sell it in 30-45 days".', 'owner', now(), 'The upper bound of the owner''s 30–45 day window.')
on conflict (key) do nothing;

-- a purchase can be tied to the Metrc package it became, so its price is the tag's cost basis
alter table public.material_purchases add column if not exists package_tag text;
alter table public.material_purchases add column if not exists manifest_number text;
alter table public.material_purchases add column if not exists supplier_licence text;
comment on column public.material_purchases.package_tag is 'The Metrc package tag this purchase arrived as (from the incoming manifest). Ties the purchase price to the tag for the money spine and the bought-in register.';
create index if not exists material_purchases_package_tag_idx on public.material_purchases (package_tag);
insert into public.column_roles (role, column_name, priority) values ('when', 'received_on', 3), ('owner', 'supplier', 20) on conflict do nothing;

-- ── the register: one row per bought-in package, with its turn ────────────────────────────────
create or replace view public.v_bought_in_register as
with p as (
  select distinct on (m.tag) m.tag, m.license, m.item_name, m.quantity, m.uom, m.source_state, coalesce(m.finished, (m.raw->>'IsFinished')::boolean, false) as finished, m.packaged_on, m.lab_testing_state, m.synced_at,
         m.raw->>'ItemFromFacilityLicenseNumber' as supplier_licence, nullif(m.raw->>'ReceivedFromFacilityName', '') as supplier,
         nullif(m.raw->>'ReceivedFromManifestNumber', '') as manifest, (m.raw->>'ReceivedDateTime')::timestamptz as received_at,
         nullif(m.raw->>'FinishedDate', '')::timestamptz as finished_at, nullif(m.raw->>'LastModified', '')::timestamptz as last_modified,
         m.raw #>> '{Item,ProductCategoryName}' as category, m.raw #>> '{Item,StrainName}' as strain, m.location
    from public.metrc_packages m
   where coalesce(m.raw->>'ItemFromFacilityLicenseNumber', '') <> '' and not public.f_is_ours(m.raw->>'ItemFromFacilityLicenseNumber')
   order by m.tag, m.synced_at desc nulls last)
select p.tag as package_tag, p.item_name, p.category, public.f_stream_for_category(p.category) as stream, p.strain, p.license as book,
       p.supplier_licence, coalesce(p.supplier, '(supplier not recorded)') as supplier,
       p.manifest as manifest_number, p.received_at, p.received_at::date as received_on,
       p.quantity, p.uom, public.f_to_pounds(p.quantity, p.uom) as pounds_now, p.lab_testing_state, p.location,
       case when p.finished or p.source_state = 'inactive' or coalesce(p.quantity, 0) = 0 then 'turned'
            when p.source_state = 'intransit' then 'in transit' else 'on hand' end as state,
       case when p.finished or p.source_state = 'inactive' or coalesce(p.quantity, 0) = 0 then coalesce(p.finished_at, p.last_modified) end as turned_at,
       extract(day from coalesce(case when p.finished or p.source_state = 'inactive' or coalesce(p.quantity, 0) = 0 then coalesce(p.finished_at, p.last_modified) end, now()) - p.received_at)::int as days_held,
       public.f_rule('bought_in_turnaround_target_days') as target_days, public.f_rule('bought_in_turnaround_max_days') as max_days,
       case when p.received_at is null then 'no receipt date on the mirror'
            when (p.finished or p.source_state = 'inactive' or coalesce(p.quantity, 0) = 0) then
                 case when extract(day from coalesce(p.finished_at, p.last_modified) - p.received_at) <= public.f_rule('bought_in_turnaround_max_days') then 'turned within the window' else 'turned late' end
            when extract(day from now() - p.received_at) > public.f_rule('bought_in_turnaround_max_days') then 'overdue'
            when extract(day from now() - p.received_at) > public.f_rule('bought_in_turnaround_target_days') then 'due — past target, inside the limit'
            else 'within target' end as verdict,
       round(coalesce(public.f_to_pounds(p.quantity, p.uom), 0) * public.f_rate_for(public.f_stream_for_category(p.category), p.tag)) as value_at_rate_usd,
       (select round(mp.unit_cost * mp.purchased_qty + coalesce(mp.freight, 0) + coalesce(mp.other_landed_cost, 0), 2) from public.material_purchases mp where mp.package_tag = p.tag order by mp.purchase_date desc nulls last limit 1) as purchase_usd,
       exists (select 1 from public.material_purchases mp where mp.package_tag = p.tag) as purchase_on_file,
       (select o.status from public.open_questions o where o.question_key = 'supplier_unnamed:' || p.supplier_licence limit 1) is not null as supplier_unnamed_question_open
  from p;
grant select on public.v_bought_in_register to authenticated;

-- ── the queue page: what needs a decision, shaped for the Findings-queue archetype ────────────
create or replace view public.v_bought_in_turnaround as
select r.package_tag, r.item_name as item, r.stream, r.supplier, r.supplier_licence, r.manifest_number, r.received_on, r.days_held, r.target_days, r.max_days, r.state, r.verdict,
       case r.verdict when 'overdue' then 'critical' when 'due — past target, inside the limit' then 'elevated' when 'turned late' then 'watch' when 'within target' then 'info' when 'turned within the window' then 'ok' else 'watch' end as severity,
       case when r.state = 'turned' then 'turned' else r.state end as status,
       r.pounds_now as pounds, r.value_at_rate_usd as dollars, r.purchase_usd, r.purchase_on_file,
       case r.verdict
         when 'overdue' then format('%s bought from %s on %s is %s days in — past the %s-day limit (target %s). %s lb still on hand at %s.', r.item_name, r.supplier, r.received_on, r.days_held, r.max_days::int, r.target_days::int, round(coalesce(r.pounds_now, 0), 1), coalesce(r.location, '?'))
         when 'due — past target, inside the limit' then format('%s from %s is %s days in — past the %s-day target, %s days to the limit.', r.item_name, r.supplier, r.days_held, r.target_days::int, (r.max_days - r.days_held)::int)
         when 'turned late' then format('%s from %s turned in %s days — past the %s-day limit.', r.item_name, r.supplier, r.days_held, r.max_days::int)
         when 'turned within the window' then format('%s from %s turned in %s days.', r.item_name, r.supplier, r.days_held)
         when 'within target' then format('%s from %s, %s days in, inside the %s-day target.', r.item_name, r.supplier, r.days_held, r.target_days::int)
         else r.verdict end as why_it_matters,
       case when r.state <> 'turned' and not r.purchase_on_file then 'Sell or process it; and enter the purchase (price, PO / invoice) on Purchases with this package tag so its cost basis is on file.'
            when r.state <> 'turned' then 'Sell or process it.' else null end as what_to_do,
       r.lab_testing_state, r.location, r.turned_at
  from public.v_bought_in_register r;
grant select on public.v_bought_in_turnaround to authenticated;

-- ── tiles for the Inventory dashboard (and the Control Tower through the same rows) ───────────
create or replace view public.v_bought_in_tiles as
select 'Inventory'::text as department, 82 as ord, 'Bought-in on hand'::text as kpi, (select round(sum(pounds_now), 1) from public.v_bought_in_register where state <> 'turned') as value, 'lb'::text as unit,
       (select case when count(*) filter (where verdict = 'overdue') > 0 then 'bad' when count(*) filter (where verdict like 'due%') > 0 then 'watch' else 'good' end from public.v_bought_in_register where state <> 'turned') as tone,
       (select format('%s packages from %s suppliers, $%s at the valuation rate. Owner rule: turn in %s–%s days. %s past the limit, %s past target.', count(*), count(distinct supplier_licence), to_char(sum(value_at_rate_usd), 'FM999,999,999'), min(target_days)::int, min(max_days)::int, count(*) filter (where verdict = 'overdue'), count(*) filter (where verdict like 'due%')) from public.v_bought_in_register where state <> 'turned') as context,
       'bought_in_turnaround'::text as drill, now() as computed_at
union all
select 'Inventory', 83, 'Bought-in past the limit', (select count(*)::numeric from public.v_bought_in_register where state <> 'turned' and verdict = 'overdue'), 'packages',
       (select case when count(*) > 0 then 'bad' else 'good' end from public.v_bought_in_register where state <> 'turned' and verdict = 'overdue'),
       (select format('%s lb, $%s at the valuation rate, more than %s days since receipt. Each is a decision on Today.', round(coalesce(sum(pounds_now), 0), 1), to_char(coalesce(sum(value_at_rate_usd), 0), 'FM999,999,999'), min(max_days)::int) from public.v_bought_in_register where state <> 'turned' and verdict = 'overdue'),
       'bought_in_turnaround', now()
union all
select 'Inventory', 84, 'Bought-in: days to turn (last 90 d)', (select round(avg(days_held), 1) from public.v_bought_in_register where state = 'turned' and turned_at >= now() - interval '90 days'), 'days',
       (select case when avg(days_held) > public.f_rule('bought_in_turnaround_max_days') then 'bad' when avg(days_held) > public.f_rule('bought_in_turnaround_target_days') then 'watch' when count(*) = 0 then 'info' else 'good' end from public.v_bought_in_register where state = 'turned' and turned_at >= now() - interval '90 days'),
       (select format('%s packages turned in the last 90 days; %s of them past the %s-day limit. Turn = finished, transferred or worked down to zero.', count(*), count(*) filter (where verdict = 'turned late'), min(max_days)::int) from public.v_bought_in_register where state = 'turned' and turned_at >= now() - interval '90 days'),
       'bought_in_turnaround', now();
grant select on public.v_bought_in_tiles to authenticated;
do $$ begin
  execute 'create or replace view public.v_dept_dash_supplement as ' || rtrim(pg_get_viewdef('public.v_dept_dash_supplement'::regclass), E'; \n') || ' union all select department, ord, kpi, value, unit, tone, context, drill, computed_at from public.v_bought_in_tiles';
end $$;

-- ── the watch: overdue packages become findings (→ Today), cleared when they turn ─────────────
insert into public.agent_registry (agent_key, display_name, kind, what_it_watches, why_it_matters, owner, expected_every_mins, evidence_table, verified_by, enabled, added_on)
values ('watch:bought_in', 'Bought-in turnaround', 'watcher', 'Every package bought from another licence: days since receipt against the owner''s 30 / 45-day rule, and whether its purchase price is on file.', 'Owner ruling 14 Sep 2026: bought-in material is product we turn around and sell in 30–45 days — major daily items, tracked site-wide.', 'Agent I', 60, 'agent_findings', 'select count(*) from agent_findings where agent_key = ''watch:bought_in'' and resolved_at is null;', true, current_date)
on conflict (agent_key) do update set enabled = true, what_it_watches = excluded.what_it_watches, why_it_matters = excluded.why_it_matters;

create or replace function public.f_bought_in_watch() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_new int := 0; v_cleared int := 0; v_price int := 0; r record;
begin
  -- one finding per overdue package
  for r in select * from public.v_bought_in_register where state <> 'turned' and verdict = 'overdue' loop
    insert into public.agent_findings (detected_at, agent, severity, headline, detail, metric, units, dollars, pounds, scope, action, drill_to, fingerprint, agent_key)
    select now(), 'Bought-in turnaround', 'critical', 'Bought-in past its turn: ' || r.package_tag || ' (' || coalesce(r.item_name, '?') || ')',
           format('%s from %s (%s), received %s on manifest %s: %s days in against the owner''s %s-day limit (target %s). %s lb on hand at %s, $%s at the valuation rate. Purchase price %s.',
                  coalesce(r.item_name, '?'), r.supplier, r.supplier_licence, r.received_on, coalesce(r.manifest_number, '?'), r.days_held, r.max_days::int, r.target_days::int, round(coalesce(r.pounds_now, 0), 1), coalesce(r.location, '?'), to_char(coalesce(r.value_at_rate_usd, 0), 'FM999,999,999'),
                  case when r.purchase_on_file then 'on file: $' || r.purchase_usd else 'NOT on file — enter it on Purchases with this tag' end),
           r.days_held, 'days', r.value_at_rate_usd, r.pounds_now, 'BP-6:bought_in:' || r.package_tag, 'Sell it or process it this week; enter the purchase if it is missing.', 'bought_in_turnaround', 'bought-in|' || r.package_tag || '|overdue', 'watch:bought_in'
    where not exists (select 1 from public.agent_findings f where f.fingerprint = 'bought-in|' || r.package_tag || '|overdue' and f.resolved_at is null);
    v_new := v_new + (case when found then 1 else 0 end);
  end loop;
  -- clear what turned
  update public.agent_findings f set resolved_at = now(), resolution = 'cleared by the bought-in watch: the package turned (' || coalesce((select r2.verdict from public.v_bought_in_register r2 where r2.package_tag = split_part(f.fingerprint, '|', 2)), 'no longer on the mirror') || ') at ' || now()::text
   where f.agent_key = 'watch:bought_in' and f.resolved_at is null and f.fingerprint like 'bought-in|%|overdue'
     and not exists (select 1 from public.v_bought_in_register r2 where r2.package_tag = split_part(f.fingerprint, '|', 2) and r2.state <> 'turned' and r2.verdict = 'overdue');
  get diagnostics v_cleared = row_count;
  -- one finding for the missing purchase prices (a family, one decision)
  select count(*) into v_price from public.v_bought_in_register where state <> 'turned' and not purchase_on_file;
  if v_price > 0 then
    insert into public.agent_findings (detected_at, agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint, agent_key)
    select now(), 'Bought-in turnaround', 'elevated', 'Bought-in packages with no purchase price on file: ' || v_price,
           v_price || ' bought-in packages on hand carry no purchase price — the Purchases table (material_purchases) has no row with their package tag. Without it the money spine cannot post their cost basis and margin per bought-in lot is unknown. Enter each purchase (supplier, PO / invoice, quantity, unit cost, freight) with the package tag on the Purchases page.',
           v_price, 'packages', 'BP-6:bought_in:purchase_price', 'Enter the purchases with their package tags on the Purchases page (Setup form).', 'bought_in_turnaround', 'bought-in|purchase-price-missing', 'watch:bought_in'
    where not exists (select 1 from public.agent_findings f where f.fingerprint = 'bought-in|purchase-price-missing' and f.resolved_at is null);
  else
    update public.agent_findings set resolved_at = now(), resolution = 'cleared: every bought-in package on hand has a purchase on file' where fingerprint = 'bought-in|purchase-price-missing' and resolved_at is null;
  end if;
  return jsonb_build_object('new_overdue', v_new, 'cleared', v_cleared, 'without_purchase_price', v_price, 'at', now());
end $$;
revoke all on function public.f_bought_in_watch() from public, anon;
select cron.unschedule(jobid) from cron.job where jobname = 'bought-in-watch';
select cron.schedule('bought-in-watch', '50 * * * *', $cron$ select public.f_bought_in_watch(); $cron$);

-- ── pages ────────────────────────────────────────────────────────────────────────────────────
insert into public.nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, surface, page_kind, subcategory, module, archetype)
values
 ('Inventory', 3, 'Bought-in turnaround', 40, 'truck', 'bought_in_turnaround', 'v_bought_in_turnaround', 'Every package bought from another licence and how many days it has been here against the owner''s rule: turn it around and sell it in 30–45 days. Overdue packages are findings and decisions on Today. Enter each purchase with its package tag on Purchases so the cost basis is on file.', true, false, 'deep', 'report', 'Purchasing & Third Party', 'inventory', 'issue_queue'),
 ('Inventory', 3, 'Bought-in register', 41, 'truck', 'bought_in_register', 'v_bought_in_register', 'The full register of bought-in packages: supplier, manifest, receipt, quantity, state, days held, verdict, value at the valuation rate, purchase price when on file.', true, false, 'deep', 'report', 'Purchasing & Third Party', 'inventory', 'stock_position')
on conflict (view_key) do update set label = excluded.label, description = excluded.description, table_ref = excluded.table_ref, enabled = true, module = excluded.module, archetype = excluded.archetype, subcategory = excluded.subcategory;

-- the open question filed this afternoon rested on a misreading — answer it with the correction
update public.open_questions set status = 'answered', answered_at = now(), answered_by = 'Claude (Agent I) — correction; owner ruling 14 Sep relayed',
  answer = 'Misread. tag_event ''received'' rows are OUR outbound deliveries being accepted by the counterparty (labs, customers) — 14,471 of them — not material we bought; the money spine no longer posts them. Bought-in material = packages whose item came from another licence (ItemFromFacilityLicenseNumber ≠ ours): 572 since Jan 2024 from 36 suppliers, 131 on hand today (≈994 lb: 429 flower, 495 trim, 70 concentrate). Owner ruling 14 Sep 2026: this is product / processing material we buy and turn around in 30–45 days, tracked site-wide — the bought-in register, turnaround queue, Inventory tiles and the hourly watch (findings → Today) are the answer. No purchase price is on file for any of them: the Purchases page (material_purchases, now with package_tag) is where they are entered.'
 where question_key = 'money_spine:received_is_purchase_or_custody' and status = 'open';

notify pgrst, 'reload schema';;
