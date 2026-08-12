-- ---------------------------------------------------------------------------
-- 0059 — Put the forensic audit into the report suite. Menus and report filters
-- are data, not code, so this needs no deploy.
-- range_kind is NOT NULL, so the census carries a value even though its
-- date_policy = not_applicable suppresses the control (a point-in-time census has
-- no date to range over).
-- ---------------------------------------------------------------------------
insert into report_registry (report_key, title, category, fact_view, date_column,
                             dimensions, measures, description, enabled)
values
 ('inventory.forensic_reconciliation','Inventory Reconciliation (annual close)','Inventory',
  'v_rpt_inventory_reconciliation','period_start',
  array['financial_year','section','line_item'], array['pounds'],
  'Opening + in - out = expected, against the counted position. Five independent '
  'sources: harvest packages, inbound manifests, outbound manifests, adjustments, '
  'package mirror. NOT an identity - the variance is a real measurement.', true),
 ('inventory.forensic_position','Forensic Inventory Position','Inventory',
  'v_forensic_inventory','dated_on',
  array['stage_group','stage','room','room_role','licence','category','product_line',
        'strain','is_ours','grown_or_processed_by','unit_type'],
  array['pounds','plant_count'],
  'Every tag in every state: growing, drying, dried bulk, ready for packaging, '
  'finished goods, and sold.', true),
 ('inventory.forensic_sold','Sold and Shipped, by Tag','Sales',
  'v_forensic_sold_by_tag','shipped_on',
  array['buyer','buyer_licence','product_line','strain','category','sold_by_licence',
        'sold_by_facility','invoice_match','internal_transfer','transfer_type','status'],
  array['pounds','total_usd'],
  'Every pound that left a licence: tag, manifest, buyer, weight, and the Apex '
  'invoice where one matches. invoice_match = NO APEX INVOICE is an exception.', true),
 ('inventory.room_census','Room Census (all forms)','Inventory',
  'v_forensic_room_census',null,
  array['stage','room','room_role','licence','detail','strain','is_ours','grown_or_processed_by'],
  array['plant_count','wet_lb','packaged_lb'],
  'Every room and every form of inventory as at the moment of the pull. Plants are '
  'counted, drying is WET lb, packages are current lb - three separate measures.', true)
on conflict (report_key) do update set
  title=excluded.title, fact_view=excluded.fact_view, date_column=excluded.date_column,
  dimensions=excluded.dimensions, measures=excluded.measures,
  description=excluded.description, enabled=true;

insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order)
values
 ('Reports','Inventory Reconciliation (annual close)','forensic_reconciliation',
  'v_rpt_inventory_reconciliation','reports','report','reconciliation',
  'Inventory & Audit','reports','box',
  'Opening + in - out = expected, against the counted position, for every financial '
  'year. Five independent sources, so it can fail to balance - and the variance line '
  'says by how much.','auto','this_year','activity',true,1),
 ('Reports','Forensic Inventory Position','forensic_position',
  'v_forensic_inventory','reports','report','stock_position',
  'Inventory & Audit','reports','box',
  'Every tag in every state - growing, drying, dried bulk, ready for packaging, '
  'finished goods, sold - with room, strain, category, licence and whether it is ours '
  'or third party.','auto','this_year','activity',true,2),
 ('Reports','Sold and Shipped, by Tag','forensic_sold_by_tag',
  'v_forensic_sold_by_tag','reports','report','custody_chain',
  'Inventory & Audit','reports','truck',
  'Every pound that left, by tag: manifest, buyer, weight, and the matching Apex '
  'invoice. Flags any shipment with no invoice behind it.','auto','this_year','activity',true,3),
 ('Reports','Room Census (all forms)','forensic_room_census',
  'v_forensic_room_census','reports','report','stock_position',
  'Inventory & Audit','reports','leafline',
  'Every room right now: live plants, drying harvests and packages, kept in separate '
  'measures so wet and cured weight can never be summed together.',
  'not_applicable','this_year','activity',true,4)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, surface=excluded.surface,
  page_kind=excluded.page_kind, archetype=excluded.archetype,
  report_group=excluded.report_group, description=excluded.description,
  date_policy=excluded.date_policy, enabled=true;
;
