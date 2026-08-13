-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTER THE FOUR WIDGET KINDS THAT WERE DECLARED AND UNBUILT
-- Agent B, 13 August 2026, for Agent I (Database COO).
--
-- WHAT WAS TRUE BEFORE THIS
-- widget_catalog_kind_check permits ten kinds:
--     metric · calendar · schedule · list · feed · messaging · tasks · alerts ·
--     lookup · chart
-- Measured 13 Aug 2026, the enabled catalogue held rows for six of them. There
-- was NOT ONE ROW of kind chart, list, feed or messaging. The constraint declared
-- them, the canvas dispatched on them, and nothing could ever be placed on a
-- dashboard to exercise any of it. A permitted value with no row is a capability
-- that exists only in a CHECK clause.
--
-- The four bodies now exist in app/web/src/wcanvas-live.jsx. These four rows are
-- what makes them reachable from "+ add a panel".
--
-- WHY THE NOTES ON THE CHOICES DO NOT CARRY COUNTS
-- The existing catalogue rows carry notes like "137 scheduled pulls — real data".
-- That was honest the day it was written and it is a figure in a place nothing
-- re-derives, which is the drift class the root-cause ledger already records
-- twice. So the notes here name the SOURCE and, where a source is empty today,
-- say UNFED — a statement the panel itself re-checks on every read and corrects
-- on screen the moment it stops being true. No count is frozen into a string.
--
-- WHAT IS DELIBERATELY NULL
-- `drill` names a platform page for the "open the full records page" button. It
-- is NULL on all four because all four are SWITCHABLE: a list set to certificate
-- status and a list set to third-party material do not belong on the same page,
-- and a fixed page under a button that says "these records" is the mistake the
-- calendar widget's own comment warns about. Every one of these panels still
-- drills IN PLACE to the exact records, and every row opens its own record — rule
-- C1 is met by the drill, not by this column. has_no_drill in
-- v_widget_catalog_available only flags metric widgets, so none of these four
-- raises the missing-drill banner, correctly.
--
-- REVERSIBLE: delete these four keys and the canvas returns to six kinds.
-- ═══════════════════════════════════════════════════════════════════════════

insert into widget_catalog
  (key, category, label, icon, table_ref, agg, value_col, filters, drill, format,
   hot, enabled, widget_kind, multi_instance, options_schema)
values

-- ── chart ──────────────────────────────────────────────────────────────────
-- Draws a figure over time from dashboard_snapshots, by way of v_dashboard_trend.
-- which_series is a live_select because the list of figures that HAVE readings is
-- rows, not a fixed schema: freezing it here would offer choices that cannot be
-- drawn and hide ones that can. Under two readings the panel draws nothing.
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

-- ── list ───────────────────────────────────────────────────────────────────
-- A compact record list. Every row opens the record itself, and where the source
-- carries a Metrc tag every row carries its certificate and its manifest.
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

-- ── feed ───────────────────────────────────────────────────────────────────
-- audit_events is marked as executives-only here because its policy is
-- USING is_executive(). Row-level security FILTERS rather than errors, so without
-- that warning a reader without the right sees an empty box that reads as "nothing
-- has happened". The panel re-checks and says so in full.
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

-- ── messaging ──────────────────────────────────────────────────────────────
-- Reads a channel and posts to it. which_channel is a live_select over channels
-- for the same reason as the chart: the rooms people talk in are rows.
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
  updated_at     = now();
