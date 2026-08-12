-- 0092 — Register the third-party forensic report with EVERY filter dimension the
-- owner may want, and the alert page. Filters are data, so adding one later is a row.
insert into report_registry (report_key, title, category, fact_view, date_column,
                             dimensions, measures, description, enabled)
values
 ('inventory.third_party_forensic','Third-Party Material — Forensic (seed to sale)','Inventory',
  'v_third_party_forensic','date_received',
  array['year_received','supplier','supplier_licence','delivered_by','our_licence',
        'category','strain','status','lab_result','ageing_band',
        'current_room','current_sublocation','inbound_manifest','outbound_manifest',
        'sold_to','made_into','destroy_reason','destroyed_by','lab_name'],
  array['lb_received','lb_on_hand','lb_sold','made_lb','lb_adjusted',
        'age_on_arrival_days','days_held_total','days_to_process','days_to_sell',
        'days_unsold_still_here','lab_tests','lab_failures'],
  'Every third-party tag from delivery to disposal: manifest, COA, rooms, processing '
  'date, sale date, destruction, and how many days it has sat unsold.', true),
 ('inventory.destroyed_unexplained','Destroyed Without Explanation','Compliance',
  'v_alert_destroyed_unexplained',null,
  array['severity','supplier','destroyed_by','destroy_reason'],
  array['pounds'],
  'Material destroyed with no reason code, no note, or no failing lab test behind it. '
  'Alerts owner, executive, CFO and admin.', true),
 ('inventory.third_party_remarks','Third-Party Remarks by Tag','Inventory',
  'v_third_party_remarks','date_received',
  array['supplier','category','strain','status','current_room'],
  array['age_on_arrival_days','days_held_total','days_to_process','days_unsold_still_here','lb_on_hand'],
  'Plain-language remarks per tag, including the processing date when the material '
  'went into our product, and the supplier-age-on-arrival distinction.', true)
on conflict (report_key) do update set
  fact_view=excluded.fact_view, date_column=excluded.date_column,
  dimensions=excluded.dimensions, measures=excluded.measures,
  description=excluded.description, enabled=true;

insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order)
values
 ('Reports','Third-Party Material — Forensic','third_party_forensic','v_third_party_forensic',
  'reports','report','custody_chain','Inventory & Audit','reports','truck',
  'Every third-party tag, seed to sale: who we bought from, the manifest, the COA, the '
  'room it sits in, when it was processed into our product, when it sold, and how many '
  'days it has been sitting unsold.',
  'auto','this_year','activity',true,25),
 ('Reports','Destroyed Without Explanation','destroyed_unexplained','v_alert_destroyed_unexplained',
  'reports','report','issue_queue','Inventory & Audit','reports','box',
  'Anything destroyed with no reason code, no note, or no failing lab test. Alerts the '
  'owner, executives, CFO and admins.',
  'not_applicable','this_year','activity',true,26),
 ('Reports','Third-Party Remarks by Tag','third_party_remarks','v_third_party_remarks',
  'reports','report','document_register','Inventory & Audit','reports','box',
  'Plain-language remarks for every third-party tag: delivery date, supplier age on '
  'arrival, processing date, sale, destruction, and days unsold.',
  'auto','this_year','activity',true,27)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, description=excluded.description, enabled=true;
;
