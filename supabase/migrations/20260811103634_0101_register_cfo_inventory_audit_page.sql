/* 0101 — the CFO / Tax page gets its own entry, not a row in the generic report browser.
 *
 * Owner, 11 Aug 2026: "I WANT A FORENSIC AUDIT PAGE FOR TAXES AND CFO", "BUILD ME A
 * SOPHISTICATED PAGE DEDICATED TO INVENTORY AUDITS AND PLANNING AND BUDGETING", and
 * "WHERE I CAN WORK FROM AND ENTER COGS, MATERIALS, PACKAGING, TARGETS FOR PRODUCTION
 * AND MANUFACTURING SCHEDULES".
 *
 * The forensic work was registered ONLY as report_registry rows, which renders it in the
 * generic data browser - a filterable grid over a view. That is a place to LOOK at data,
 * not a place to WORK. It has no entry fields, so none of the cost, packaging or target
 * inputs the owner asked for could exist there at all. That was the miss.
 *
 * archetype cost_sheet, not stock_position: this page is about money and inputs.
 * default_range 'all' - preset_key is a foreign key to date_range_presets, and 'ytd' is
 * not one of them. Read the table rather than assume the name.
 */
insert into nav_registry
  (category, category_order, label, item_order, icon, view_key, description,
   enabled, admin_only, module, archetype, page_kind, surface, date_policy, default_range, range_kind)
values
  ('Finance', 0, 'Inventory Audit, Planning & Budgeting', 1, 'dollar', 'cfo_inventory_audit',
   'Tax and CFO working page. What we spend on third-party material by tax year and supplier, '
   'cash tied up in stock we still hold, what was written off - and the input fields for cost '
   'of goods, materials, packaging and production targets. Costs that cannot be evidenced are '
   'shown as unknown, never estimated.',
   true, false, 'finance', 'cost_sheet', 'report', 'finance', 'range', 'all', 'date')
on conflict (view_key) do update set
  category = excluded.category, label = excluded.label, item_order = excluded.item_order,
  icon = excluded.icon, description = excluded.description, enabled = true,
  module = excluded.module, archetype = excluded.archetype, surface = excluded.surface;;
