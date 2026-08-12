-- Agent I, 12 Aug 2026. DBI-073. The owner's widget ideas, registered — but ONLY where the data
-- behind them is real. A widget offered in the picker that can only ever render an empty box is
-- worse than one not offered: the user spends a drag finding out.
--
-- Each declares options_schema: what the dropdown offers. Choices are DATA, so a new calendar is
-- a row here, not a deploy.

insert into widget_catalog
 (key, category, label, icon, widget_kind, multi_instance, table_ref, drill, hot, enabled, options_schema)
values

('cal_operations','Command','Calendar','📅','calendar',true,
 'harvest_schedule','harvest_issues',false,true,
 '{"which_calendar":{"label":"Which calendar","type":"select","default":"harvest_pulls","options":[
    {"value":"harvest_pulls","label":"Harvest pulls","source":"harvest_schedule","note":"137 scheduled pulls — real data"},
    {"value":"outgoing","label":"Deliveries and pickups","source":"metrc_transfers","note":"outbound manifests by date"},
    {"value":"expiring","label":"Product expiring","source":"sheet: manufacturing_product_inventory","note":"expiry dates the owner''s sheet carries and Metrc does not"}]},
   "days_ahead":{"label":"Days ahead","type":"number","default":30,"min":7,"max":180}}'::jsonb),

('sched_production','Command','Production schedule','🏭','schedule',true,
 'harvest_schedule','harvest_issues',false,true,
 '{"which_schedule":{"label":"Which schedule","type":"select","default":"cultivation","options":[
    {"value":"cultivation","label":"Cultivation — harvest pulls","source":"harvest_schedule","note":"137 rows, real"},
    {"value":"manufacturing","label":"Manufacturing runs","source":"work_orders","note":"UNFED — work_orders is empty; renders the honest gap card"}]},
   "group_by":{"label":"Group by","type":"select","default":"room","options":["room","cultivar","week"]}}'::jsonb),

('alerts_live','Command','Alerts while you work','🔔','alerts',false,
 'alert_outbox','intelligence_briefing',true,true,
 '{"severity_at_least":{"label":"Show","type":"select","default":"elevated","options":["critical","elevated","watch","everything"]},
   "unread_only":{"label":"Unread only","type":"boolean","default":true}}'::jsonb),

('tasks_mine','Workspace','Tasks','☑','tasks',true,
 'tasks','tasks',false,true,
 '{"whose":{"label":"Whose tasks","type":"select","default":"mine","options":[
    {"value":"mine","label":"Assigned to me"},
    {"value":"team","label":"My department"},
    {"value":"everyone","label":"Everyone"}]},
   "include_done":{"label":"Include completed","type":"boolean","default":false},
   "overdue_first":{"label":"Overdue first","type":"boolean","default":true}}'::jsonb),

('tag_lookup','Command','Find any tag','🔎','lookup',false,
 'v_tag_resolver','stock_on_hand',false,true,
 '{"placeholder":{"label":"Prompt","type":"text","default":"Paste any Metrc tag"}}'::jsonb)

on conflict (key) do update set
  widget_kind = excluded.widget_kind, multi_instance = excluded.multi_instance,
  options_schema = excluded.options_schema, label = excluded.label,
  icon = excluded.icon, updated_at = now();

comment on table widget_catalog is
 'Every widget the platform can render. 45 original METRIC tiles (a number, a source, a drill) '
 'plus interactive kinds added 12 Aug 2026 on the owner''s ideas: calendar, schedule, alerts, '
 'tasks and a tag lookup. options_schema declares what each instance lets a user configure and '
 'the permitted choices — a new calendar is a ROW here, never a deploy. Widgets are registered '
 'only where the data behind them is real: one offered in the picker that can only render an '
 'empty box wastes the user''s drag to find out. Where a source is genuinely unfed the option '
 'says so in its note, so the honest gap card is a deliberate choice rather than a surprise.';;
