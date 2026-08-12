-- ---------------------------------------------------------------------------
-- 0068 — THE PRODUCTION CALCULATOR, built into the OS.
--
-- Seeded from the owner's own worksheet, docs/source-of-truth/
-- Manufacturing_Production_Worksheet.xlsx, sheet by sheet. NOT from industry
-- guidance and NOT inferred from Metrc: every row names the cell it came from so a
-- reviewer can open the workbook and check it.
--
-- (The BOM & Yield tab of the Enterprise Operations Planner is a different, EMPTY
-- template - every Qty per Finished Unit and Expected Yield reads 0.0. It cannot
-- compute anything and is not the source used here.)
--
-- Every value is editable. Nothing here is hardcoded in a view.
-- ---------------------------------------------------------------------------
create table if not exists production_yield_standard (
  key           text primary key,
  process       text not null,
  value         numeric not null,
  unit          text not null,
  label         text not null,
  source_cell   text,
  what_it_means text,
  set_by        text not null default 'Manufacturing Production Worksheet',
  updated_at    timestamptz not null default now()
);

insert into production_yield_standard (key, process, value, unit, label, source_cell, what_it_means) values
 ('hydro_batch_lb','Hydrocarbon',15,'lb','Hydrocarbon batch size','Summary A5','One batch is 15 lb = 6,810 g of input material.'),
 ('hydro_crude_yield_pct','Hydrocarbon',0.12,'ratio','Average crude oil yield','Summary B13','Crude oil recovered as a share of input weight. Marked "can edit".'),
 ('hydro_diamond_from_oil_pct','Hydrocarbon',0.35,'ratio','Yield to diamonds from crude oil','Summary B16','Share of crude that becomes diamonds. Marked "can edit".'),
 ('hydro_liquid_diamond_conv','Hydrocarbon',0.877,'ratio','Liquid diamond conversion','Summary B20','Diamond to liquid diamond, i.e. 12.3% decarboxylation loss.'),
 ('hydro_extraction_efficiency','Hydrocarbon',0.75,'ratio','Extraction efficiency','Volatile IN_OUT B11','Share of available cannabinoids actually recovered.'),
 ('rosin_batch_ff_lb','Solventless',60,'lb','Fresh frozen batch size','Summary L5','One solventless batch is 60 lb of fresh frozen.'),
 ('rosin_bubble_yield_pct','Solventless',0.032,'ratio','Average bubble hash yield','Summary M19','Bubble hash as a share of fresh frozen input. Low scenario 2.8%, target 3.5%.'),
 ('rosin_to_rosin_pct','Solventless',0.81,'ratio','Yield to rosin from bubble hash','Summary M23','Bubble hash pressed to rosin.'),
 ('fresh_frozen_to_dry_ratio','Cultivation',0.20,'ratio','Fresh frozen as a share of dry weight','Summary M11','Fresh frozen is priced at 0.2 of the dry rate, i.e. 5 lb wet = 1 lb dry equivalent. NOTE: conversion_factors.fresh_frozen_wet_to_dry holds 4.5 from industry guidance; THIS 5.0 is the owner''s own worksheet and should win.'),
 ('avg_trim_yield_pct','Cultivation',0.3223,'ratio','Average trim yield','Summary M9','Trim as a share of harvested material.'),
 ('preroll_50_50_flower_pct','Pre-roll',0.50,'ratio','B-grade 50/50 formulation, flower share','Summary Q19','50% flower, 50% trim. Flower wholesale $750 per 386 g basis.'),
 ('preroll_30_70_flower_pct','Pre-roll',0.30,'ratio','B-grade 30/70 formulation, flower share','Summary Q20','30% flower, 70% trim. Flower wholesale $570 per 386 g basis.'),
 ('flower_price_lb','Pricing',1200,'USD/lb','Flower price used in the cost model','Summary Q6','Cost basis for 1 g raw pre-roll costing.'),
 ('trim_price_lb','Pricing',300,'USD/lb','Trim price used in the cost model','Summary C6/A7','$300 per lb.'),
 ('premium_min_price_per_unit','Tiering',3.00,'USD/unit','Premium threshold, price per unit','Owner 11 Aug 2026','"WE SOLD PREMIUM UNDER TWISTED BUDS FOR 3.00 PLUS A UNIT".')
on conflict (key) do update set
  value=excluded.value, unit=excluded.unit, label=excluded.label,
  source_cell=excluded.source_cell, what_it_means=excluded.what_it_means, updated_at=now();

comment on table production_yield_standard is
  'The production calculator, from the owner''s Manufacturing Production Worksheet. '
  'Every row names the source cell. Editable - no view may hardcode these numbers.';


-- Brand carries the tier. The product NAME does not: a search of all 6,036 pre-roll,
-- 1,127 cartridge and 2,129 extract lines found neither "premium" nor "economy".
create table if not exists product_brand_tier (
  brand      text primary key,
  tier       text not null check (tier in ('PREMIUM','ECONOMY','OTHER')),
  material   text not null,
  note       text,
  set_by     text not null default 'Owner (Vinny), 11 Aug 2026',
  updated_at timestamptz not null default now()
);

insert into product_brand_tier (brand, tier, material, note) values
 ('Twisted Buds','PREMIUM','Our own buds — pure flower',
  'Owner: premium is all our own buds. Sold at $3.00+ a unit. Measured: prepack averages $10.24/unit over 159,519 units, pre-rolls $4.45 over 36,996.'),
 ('Twisted','ECONOMY','May include third-party flower and trim mix',
  'Owner: economy could be third-party cheap flower and trim mix. Measured: 1,080,361 pre-roll units at $1.91 average.'),
 ('Dope Chemist','OTHER','Extract and cartridge brand','40,688 extract units at $14.69, 14,300 cartridge units at $9.70.'),
 ('No Bull','OTHER','Cartridge brand','23,643 units at $11.88.'),
 ('North End Blunts','OTHER','Pre-roll brand','18,240 units at $5.72.')
on conflict (brand) do update set
  tier=excluded.tier, material=excluded.material, note=excluded.note, updated_at=now();

comment on table product_brand_tier is
  'PREMIUM draws our own buds; ECONOMY may draw third-party flower and trim mix. '
  'Owner ruling 11 Aug 2026. The tier is carried by BRAND, not by the product name. '
  'OTHER means the tier has not been stated and must not be guessed.';

grant select on production_yield_standard, product_brand_tier to authenticated;
;
