-- 0015: Finished-goods inventory — exact mirror of the team's live Google Sheet, with push-button sync

create table if not exists product_inventory (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('solventless','hydrocarbon','infused_preroll','raw_preroll_1g','raw_preroll_05g','economy_raw_1g','economy_infused','economy_raw_05g','vaporizer')),
  current_status text,
  projected_avail text,
  bulk_metrc_tag text,
  prefill_metrc_tag text,
  final_metrc_tag text,
  production_batch text,
  strain_flavor text,
  product_description text,
  size_g text,
  total_bulk numeric,
  total_filled numeric,
  total_units numeric,
  total_gram_equivalent numeric,
  total_packaged numeric,
  case_size numeric,
  cases_available numeric,
  creation_date date,
  expiration_date date,
  tac_pct numeric,
  terpene_pct numeric,
  thca_pct numeric,
  source_sheet text,
  source_row integer,
  raw jsonb,
  synced_at timestamptz not null default now()
);
alter table product_inventory enable row level security;
create policy staff_read on product_inventory for select to authenticated using (true);
create policy exec_all on product_inventory for all using (is_executive()) with check (is_executive());
create index if not exists idx_product_inventory_cat on product_inventory (category);
create index if not exists idx_product_inventory_status on product_inventory (current_status);

create table if not exists third_party_material (
  id uuid primary key default gen_random_uuid(),
  company text,
  metrc_tag text,
  strain text,
  product text,
  weight_g numeric,
  weight_lbs numeric,
  location text,
  inventory_check text,
  notes text,
  source_row integer,
  synced_at timestamptz not null default now()
);
alter table third_party_material enable row level security;
create policy staff_read on third_party_material for select to authenticated using (true);
create policy exec_all on third_party_material for all using (is_executive()) with check (is_executive());

-- Their Config tab + Inventory Value Sheet per-unit values, as admin-editable data (Law #4)
create table if not exists inventory_config (
  id uuid primary key default gen_random_uuid(),
  sheet_name text not null unique,
  threshold_units numeric,
  target_cases numeric,
  units_per_case numeric,
  categories text[] not null default '{}'
);
alter table inventory_config enable row level security;
create policy staff_read on inventory_config for select to authenticated using (true);
create policy exec_all on inventory_config for all using (is_executive()) with check (is_executive());

create table if not exists inventory_values (
  id uuid primary key default gen_random_uuid(),
  level_label text not null unique,
  value_per_unit numeric not null,
  formula_note text
);
alter table inventory_values enable row level security;
create policy staff_read on inventory_values for select to authenticated using (true);
create policy exec_all on inventory_values for all using (is_executive()) with check (is_executive());

insert into inventory_config (sheet_name, threshold_units, target_cases, units_per_case, categories) values
('Solventless', 48, 4, 12, '{solventless}'),
('Hydrocarbon', 48, 4, 12, '{hydrocarbon}'),
('Infused PreRolls', 120, 6, 20, '{infused_preroll}'),
('Raw PreRolls', 480, 10, 48, '{raw_preroll_1g,raw_preroll_05g}'),
('Economy PreRoll', 2000, 20, 100, '{economy_raw_1g,economy_raw_05g}'),
('Economy Infused', 500, 5, 100, '{economy_infused}'),
('Vaporizers', 72, 6, 12, '{vaporizer}')
on conflict (sheet_name) do nothing;

insert into inventory_values (level_label, value_per_unit, formula_note) values
('Solventless', 15, 'sum(bulk+filled+packaged) x 15'),
('Hydrocarbon - Cured Badder', 9, 'sum(bulk+filled+packaged) where description = Cured Badder x 9'),
('Hydrocarbon - Live Badder', 12, 'sum(bulk+filled+packaged) where description = Live Badder x 12'),
('Raw Pre-rolls', 3.75, 'sum(bulk+filled+packaged) x 3.75'),
('Infused Pre-rolls', 7, 'sum(bulk+filled+packaged) x 7'),
('Economy infused', 5, 'sum(bulk+filled+gram equivalent+packaged) x 5'),
('Economy Raw', 1.9, 'sum(bulk+filled+packaged) x 1.9'),
('Vapes', 12, 'sum(bulk+filled+packaged) x 12')
on conflict (level_label) do nothing;

-- Inventory Value Sheet, replicated live (their exact per-level formulas, values from inventory_values)
create or replace view v_inventory_value with (security_invoker = true) as
with sums as (
  select
    case
      when category = 'solventless' then 'Solventless'
      when category = 'hydrocarbon' and lower(coalesce(product_description,'')) like '%cured%' then 'Hydrocarbon - Cured Badder'
      when category = 'hydrocarbon' then 'Hydrocarbon - Live Badder'
      when category in ('raw_preroll_1g','raw_preroll_05g') then 'Raw Pre-rolls'
      when category = 'infused_preroll' then 'Infused Pre-rolls'
      when category = 'economy_infused' then 'Economy infused'
      when category in ('economy_raw_1g','economy_raw_05g') then 'Economy Raw'
      when category = 'vaporizer' then 'Vapes'
    end as level_label,
    sum(coalesce(total_bulk,0) + coalesce(total_filled,0) + coalesce(total_packaged,0)
        + case when category = 'economy_infused' then coalesce(total_gram_equivalent,0) else 0 end) as units,
    sum((coalesce(total_bulk,0) + coalesce(total_filled,0) + coalesce(total_packaged,0)
        + case when category = 'economy_infused' then coalesce(total_gram_equivalent,0) else 0 end)
        * (case when creation_date is not null and creation_date > current_date - 90 then 1 else 0 end)) as units_0_90,
    sum((coalesce(total_bulk,0) + coalesce(total_filled,0) + coalesce(total_packaged,0)
        + case when category = 'economy_infused' then coalesce(total_gram_equivalent,0) else 0 end)
        * (case when creation_date is not null and creation_date <= current_date - 90 and creation_date > current_date - 180 then 1 else 0 end)) as units_91_180,
    sum((coalesce(total_bulk,0) + coalesce(total_filled,0) + coalesce(total_packaged,0)
        + case when category = 'economy_infused' then coalesce(total_gram_equivalent,0) else 0 end)
        * (case when creation_date is not null and creation_date <= current_date - 180 and creation_date > current_date - 270 then 1 else 0 end)) as units_181_270,
    sum((coalesce(total_bulk,0) + coalesce(total_filled,0) + coalesce(total_packaged,0)
        + case when category = 'economy_infused' then coalesce(total_gram_equivalent,0) else 0 end)
        * (case when creation_date is not null and creation_date <= current_date - 270 then 1 else 0 end)) as units_271_plus
  from product_inventory
  group by 1
)
select v.level_label as inventory_level,
  v.value_per_unit,
  round((coalesce(s.units,0) * v.value_per_unit)::numeric, 2) as inventory_value,
  round((coalesce(s.units_0_90,0) * v.value_per_unit)::numeric, 2) as value_0_90_days,
  round((coalesce(s.units_91_180,0) * v.value_per_unit)::numeric, 2) as value_91_180_days,
  round((coalesce(s.units_181_270,0) * v.value_per_unit)::numeric, 2) as value_181_270_days,
  round((coalesce(s.units_271_plus,0) * v.value_per_unit)::numeric, 2) as value_271_plus_days,
  v.formula_note
from inventory_values v
left join sums s on s.level_label = v.level_label;

-- Inventory Summary, replicated live (low-stock + expiry flags from their Config thresholds)
create or replace view v_inventory_summary with (security_invoker = true) as
select
  c.sheet_name as product_line,
  p.strain_flavor as product,
  p.production_batch as batch,
  p.size_g as size,
  p.current_status,
  coalesce(p.total_packaged, p.total_units, 0) as ending_units,
  round((coalesce(p.total_packaged, p.total_units, 0) / nullif(coalesce(p.case_size, c.units_per_case), 0))::numeric, 1) as ending_cases,
  case when coalesce(p.total_packaged, p.total_units, 0) < c.threshold_units then 'LOW' end as low_flag,
  case when p.expiration_date is not null and p.expiration_date < current_date + 30 then 'EXP <30d' end as expiry_flag,
  round(((coalesce(p.total_bulk,0) + coalesce(p.total_filled,0)) / nullif(c.units_per_case, 0))::numeric, 1) as possible_cases,
  p.expiration_date,
  p.category
from product_inventory p
join inventory_config c on p.category = any (c.categories);

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values
  ('Inventory', 5, 6, 'fg_inventory', 'Finished Goods (Live Sheet)', 'product_inventory', null, 'box',
   'The team''s live finished-goods sheet, mirrored exactly: all nine product lines with Metrc tags, batches, fill/package counts, cases, expiration, and potency. One button re-syncs from Google Sheets for the whole team.', true, '#00d4ff'),
  ('Inventory', 5, 7, 'third_party', '3rd Party Material', 'third_party_material', null, 'truck',
   'Third-party material on site: company, Metrc tag, product, weights, vault location, and physical inventory confirmations.', true, '#00d4ff'),
  ('Inventory', 5, 8, 'inv_value', 'Inventory Value', 'v_inventory_value', null, 'dollar',
   'Live inventory valuation using the company''s own per-unit values and formulas, with 0-90 / 91-180 / 181-270 / 271+ day aging buckets.', true, '#00d4ff'),
  ('Inventory', 5, 9, 'inv_summary', 'Inventory Summary', 'v_inventory_summary', null, 'clip',
   'Weekly-style roll-up per batch: ending units and cases, LOW flags against Config thresholds, expiring-within-30-days flags, and possible cases from bulk plus filled.', true, '#00d4ff')
on conflict do nothing;;
