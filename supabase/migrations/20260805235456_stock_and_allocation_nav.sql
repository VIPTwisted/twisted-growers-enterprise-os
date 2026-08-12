insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Stock On Hand', 6, 'package', 'stock_summary', 'v_stock_summary',
  'What we are actually sitting on, split by stream. Fresh frozen and dried flower are different products and are never blended. Shows sellable, failed, out-for-testing and untested pounds, and the age of the oldest package.'),
 ('Stock Detail', 7, 'list', 'stock_on_hand', 'v_stock_on_hand',
  'Every stream broken down by licence, testing state and physical location, with package counts, grams, pounds and age.'),
 ('Storage & Allocation Limits', 8, 'sliders', 'storage_limits', 'storage_limits',
  'Owner-set ceilings: how many pounds may be held per stream and how long material may sit. Editable rows, no code change needed.'),
 ('Limit Status', 9, 'alert-triangle', 'storage_limit_status', 'v_storage_limit_status',
  'Live position against every limit, with a plain verdict: within limits, approaching, over, or no limit set yet.'),
 ('Moisture & Mass Balance', 10, 'droplet', 'moisture_accounting', 'v_moisture_accounting',
  'Every harvest reconciled: wet weight equals packaged plus recorded waste plus evaporated moisture. Proves nothing is missing, and flags any harvest that disagrees with the Metrc current weight.'),
 ('Allocation Queue', 11, 'check-square', 'allocation_queue', 'v_allocation_queue',
  'Every allocation request and where it stands. Nothing moves until it is approved. Denials require a written reason of twenty characters or more, enforced by the database.'),
 ('Material With No Allocation', 12, 'shield', 'unrequested_material', 'v_unrequested_material',
  'Material on hand with no approved allocation at all. This is the live exposure against the rule that nothing moves without approval.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);

insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from
 (values ('stock_summary'),('stock_on_hand'),('storage_limit_status'),('moisture_accounting'),('allocation_queue'),('unrequested_material')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;

insert into nav_role_visibility (view_key, role, visible)
select 'storage_limits', r.role, r.vis from
 (values ('owner',true),('executive',true),('planner',false),('dept_head',false),('staff',false),('readonly',false)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;

insert into golive_items (phase, phase_name, title, detail, status, owner_action, priority, source, sort)
select * from (values
 (3,'Inventory Control','Vincent approves every allocation - enforce it',
  'THE PRIORITY. Nothing may move without Vincent approving it. Built: a database trigger that refuses any approval without a named decider and refuses any denial without a written reason of 20+ characters; an Allocation Queue page showing every request, who raised it, how many days it has waited and whether it is past its needed-by date; and a Material With No Allocation page showing every pound on hand that no approved request covers. OWNER ACTION: work the queue, and decide whether requests should be required before material is even packaged rather than before it moves.',
  'open',true,'P1','Owner request 2026-08-05',920),
 (3,'Inventory Control','Split fresh frozen from dried flower everywhere',
  'Fresh frozen keeps its water and converts at about 78 percent; dried flower loses its water and converts at about 21.6 percent. Blending them produced a meaningless 35.1 percent company figure. Stock On Hand now separates every stream and never blends them. STILL TO DO: apply the same split to the Chief Executive Dashboard conversion card, the yield reports and Control Tower, and populate harvest_weights.fresh_frozen_dry_eq_lb (the column exists, the table has zero rows) so fresh frozen can be judged in dry-equivalent pounds.',
  'open',false,'P1','Owner request 2026-08-05',921),
 (3,'Inventory Control','Set the storage and allocation limits',
  'Storage limits are live but deliberately blank. Vincent needs to set: maximum pounds of fresh frozen the freezer may hold and how many days it may sit before it must be processed (defaulted to 60 days, no weight cap); maximum dried flower on hand and maximum package age (defaulted 90 days); same for concentrate (120 days). Editable rows on the Storage and Allocation Limits page. OWNER ACTION: set the numbers.',
  'open',true,'P1','Owner request 2026-08-05',922),
 (3,'Inventory Control','Reconcile spreadsheets against Metrc',
  'Metrc holds materially more than the sheets describe. Confirmed gaps: ten Economy Raw rows dated 20260805 have a blank bulk_metrc_tag though the weights match perfectly - paste the ten tags in; TG Fruit Salad 20260701 (A) shows 6,810 g on the sheet against 69 g in Metrc; TG Lemon Mintz 20260617 (A) is 372 g out; no sheet covers fresh frozen or bulk freezer material at all; all MC281714 flower is absent from the sheet tag columns. OWNER ACTION: paste the ten tags, chase Fruit Salad, and start a bulk and freezer sheet that covers everything Metrc shows.',
  'open',true,'P1','Owner request 2026-08-05',923),
 (3,'Inventory Control','Withdraw the yield underperformance dollar figure',
  'The loss summary carries a $2,251,040 yield underperformance line. It scores each harvest against the company average conversion and calls the gap a loss - a relative measure, not missing pounds, and it double-counts weight already explained by evaporated moisture. It also used the blended 35.1 percent that mixed fresh frozen with dried flower, so the baseline itself was wrong. TO DO: remove it from the loss summary and replace it with the two figures that are real - failed testing at 168.9 lb, and dry-time weight loss measured against the 10 to 14 day window.',
  'open',false,'P1','Claude analysis 2026-08-05',924)
) v(phase,phase_name,title,detail,status,owner_action,priority,source,sort)
where not exists (select 1 from golive_items g where g.title = v.title);;
