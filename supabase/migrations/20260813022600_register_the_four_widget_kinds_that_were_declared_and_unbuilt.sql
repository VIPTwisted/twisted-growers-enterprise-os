-- Agent B, 13 Aug 2026, for Agent I. widget_catalog_kind_check permits ten kinds;
-- the enabled catalogue held rows for six. chart, list, feed and messaging were
-- declared in a CHECK clause and had no row, so nothing could be placed to exercise
-- them. The four bodies now exist in app/web/src/wcanvas-live.jsx; these rows make
-- them reachable from "+ add a panel". drill is NULL on all four deliberately: each
-- is switchable, so a fixed platform page under a button saying "these records"
-- would open the wrong thing. Every one drills in place to the exact records.
-- Reversible: delete these four keys and the canvas returns to six kinds.

insert into widget_catalog
  (key, category, label, icon, table_ref, agg, value_col, filters, drill, format,
   hot, enabled, widget_kind, multi_instance, options_schema)
values
('chart_trend', 'Command', 'A figure over time', '📈', 'dashboard_snapshots',
 'count', null, '[]'::jsonb, null, null, false, true, 'chart', true,
 jsonb_build_object(
   'which_series', jsonb_build_object(
     'type', 'live_select', 'source', 'v_dashboard_trend', 'label', 'Which figure'),
   'shape', jsonb_build_object(
     'type', 'select', 'label', 'Draw as', 'default', 'line',
     'options', jsonb_build_array(
       jsonb_build_object('value', 'line', 'label', 'Line',
         'note', 'each reading joined to the next — for a level that moves'),
       jsonb_build_object('value', 'bars', 'label', 'Bars',
         'note', 'one bar per reading — for a count'))))),

('list_records', 'Command', 'A list of records', '📋', 'v_item_flags',
 'count', null, '[]'::jsonb, null, null, false, true, 'list', true,
 jsonb_build_object(
   'which_list', jsonb_build_object(
     'type', 'select', 'label', 'Which list', 'default', 'flagged_items',
     'options', jsonb_build_array(
       jsonb_build_object('value', 'flagged_items', 'label', 'Items flagged for a decision',
         'source', 'v_item_flags', 'note', 'open flags, newest first'),
       jsonb_build_object('value', 'coa_status', 'label', 'Certificate status by package',
         'source', 'v_rpt_coa_compliance', 'note', 'each row carries its certificate and manifest'),
       jsonb_build_object('value', 'finished_goods', 'label', 'Finished goods on hand',
         'source', 'product_inventory', 'note', 'from the owner''s inventory sheet, soonest to expire first'),
       jsonb_build_object('value', 'third_party', 'label', 'Third-party material held',
         'source', 'third_party_material', 'note', 'material that is not ours, by company'),
       jsonb_build_object('value', 'open_actions', 'label', 'Open actions',
         'source', 'actions_register', 'note', 'the action register, soonest due first'))),
   'how_many', jsonb_build_object(
     'type', 'number', 'label', 'Rows on the panel', 'default', 25, 'min', 5, 'max', 200))),

('feed_activity', 'Command', 'What has just happened', '📰', 'watchdog_findings',
 'count', null, '[]'::jsonb, null, null, false, true, 'feed', true,
 jsonb_build_object(
   'which_feed', jsonb_build_object(
     'type', 'select', 'label', 'Which activity', 'default', 'watchdog',
     'options', jsonb_build_array(
       jsonb_build_object('value', 'watchdog', 'label', 'What the watchdog found',
         'source', 'watchdog_findings', 'note', 'findings, newest first'),
       jsonb_build_object('value', 'platform', 'label', 'Everything the platform recorded',
         'source', 'audit_events',
         'note', 'executives only — row-level security hides it from every other account'),
       jsonb_build_object('value', 'task_activity', 'label', 'Task activity',
         'source', 'task_activity', 'note', 'UNFED — task_activity holds no rows yet'),
       jsonb_build_object('value', 'task_comment', 'label', 'Comments on tasks',
         'source', 'task_comment', 'note', 'UNFED — task_comment holds no rows yet'))),
   'open_only', jsonb_build_object(
     'type', 'boolean', 'label', 'Open only', 'default', true),
   'how_many', jsonb_build_object(
     'type', 'number', 'label', 'Entries on the panel', 'default', 30, 'min', 5, 'max', 200))),

('messaging_team', 'Workspace', 'Team messaging', '💬', 'messages',
 'count', null, '[]'::jsonb, null, null, false, true, 'messaging', true,
 jsonb_build_object(
   'which_channel', jsonb_build_object(
     'type', 'live_select', 'source', 'channels', 'label', 'Channel'),
   'how_many', jsonb_build_object(
     'type', 'number', 'label', 'Messages on the panel', 'default', 30, 'min', 5, 'max', 200)))

on conflict (key) do update set
  category       = excluded.category,
  label          = excluded.label,
  icon           = excluded.icon,
  table_ref      = excluded.table_ref,
  widget_kind    = excluded.widget_kind,
  multi_instance = excluded.multi_instance,
  options_schema = excluded.options_schema,
  enabled        = excluded.enabled,
  updated_at     = now();;
