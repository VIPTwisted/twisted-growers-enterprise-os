-- 0073 — Put the calculator on screen. rules_editor is the archetype the OS already
-- uses for owner-editable standards, so these behave like every other rules page.
insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order)
values
 ('Reports','Production Yield Standards','production_yield_standard',
  'production_yield_standard','reports','report','rules_editor',
  'Inventory & Audit','reports','box',
  'The production calculator from the Manufacturing Production Worksheet: extraction '
  'yields, batch sizes, fresh frozen ratio, pre-roll formulations and the cost basis. '
  'Every row names the worksheet cell it came from. Editable.',
  'not_applicable','this_year','activity',true,5),

 ('Reports','Brand Tier and Material','product_brand_tier',
  'product_brand_tier','reports','report','rules_editor',
  'Inventory & Audit','reports','box',
  'Which brands are PREMIUM (our own buds) and which are ECONOMY (may include '
  'third-party flower and trim). The tier is carried by BRAND — it is not written in '
  'any product name.',
  'not_applicable','this_year','activity',true,6),

 ('Reports','Pre-Roll Formulation (by period)','preroll_formulation',
  'preroll_formulation','reports','report','rules_editor',
  'Inventory & Audit','reports','box',
  'Flower:trim split by brand, effective-dated. The mix changes with available '
  'inventory, so each row carries the window it applies to — editing it going forward '
  'never restates a closed period.',
  'auto','this_year','activity',true,7),

 ('Reports','Inventory Cost Rates','inventory_cost_rate',
  'inventory_cost_rate','reports','report','rules_editor',
  'Inventory & Audit','reports','dollar',
  'Cost per material at any scope — tag, batch, brand, product line, category or '
  'global — over any period. Most specific wins. Weekly, monthly, quarterly and '
  'annual are the same mechanism at different lengths.',
  'auto','this_year','activity',true,8),

 ('Reports','Material Drawn by Sales','material_requirement',
  'v_material_requirement','reports','report','cost_sheet',
  'Inventory & Audit','reports','box',
  'Material consumed by what we actually sold, from the owner''s calculator. Premium '
  'pre-rolls are pure flower with no formulation; concentrate shows finished oil only, '
  'because adding its input material would double-dip the cost of materials.',
  'auto','this_year','activity',true,9)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, surface=excluded.surface,
  page_kind=excluded.page_kind, archetype=excluded.archetype,
  report_group=excluded.report_group, description=excluded.description,
  date_policy=excluded.date_policy, enabled=true;

insert into report_registry (report_key, title, category, fact_view, date_column,
                             dimensions, measures, description, enabled)
values ('inventory.material_drawn','Material Drawn by Sales','Inventory',
  'v_material_requirement','order_date',
  array['brand','tier','apex_category','product_type','product_name','strain','buyer','basis'],
  array['units','flower_lb','trim_lb','concentrate_lb'],
  'Material consumed by what we sold. Concentrate is the FINISHED OIL weight only — '
  'its input material is deliberately excluded to avoid double-dipping the cost of '
  'materials.', true)
on conflict (report_key) do update set
  fact_view=excluded.fact_view, date_column=excluded.date_column,
  dimensions=excluded.dimensions, measures=excluded.measures, enabled=true;
;
