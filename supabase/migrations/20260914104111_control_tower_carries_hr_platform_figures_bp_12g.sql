-- BP-12g · the Control Tower carries the HR platform's own figures (hrp.dashboard_tiles_match).
-- v_control_tower is (metric, value) rows the tower maps to tiles; the people figures come from
-- hr.command_center_tiles() — the one derivation the HR Command Center and the OS HR dashboard
-- read — so the tower's number is the HR platform's number, not a second count.
set search_path = public, hr, extensions;

create or replace view public.v_control_tower as
 SELECT 'late_or_at_risk_orders'::text AS metric, (count(*))::numeric AS value
   FROM sales_orders WHERE ((sales_orders.status = ANY (ARRAY['open'::text, 'confirmed'::text])) AND (sales_orders.promised_ship_on < CURRENT_DATE))
UNION ALL
 SELECT 'unconfirmed_open_orders'::text, count(*) FROM sales_orders WHERE (sales_orders.status = 'open'::text)
UNION ALL
 SELECT 'testing_overdue'::text, count(*) FROM test_requests
  WHERE ((test_requests.status = ANY (ARRAY['planned'::test_status, 'submitted'::test_status, 'at_lab'::test_status])) AND (test_requests.submit_due_on < CURRENT_DATE))
UNION ALL
 SELECT 'lots_rts_missing_coa'::text, count(*) FROM lots WHERE ((lots.status = 'ready_to_ship'::lot_status) AND (lots.coa_id IS NULL))
UNION ALL
 SELECT 'lots_expired_sellable'::text, count(*) FROM lots
  WHERE ((lots.expires_on < CURRENT_DATE) AND (lots.status = ANY (ARRAY['ready_to_ship'::lot_status, 'packaging'::lot_status, 'packaging_queue'::lot_status])))
UNION ALL
 SELECT 'pending_allocations'::text, count(*) FROM allocations WHERE (allocations.approval = 'pending'::approval_status)
UNION ALL
 SELECT 'blocked_work_orders'::text, count(*) FROM work_orders w
  WHERE ((w.status = ANY (ARRAY['ready'::wo_status, 'released'::wo_status])) AND (NOT (EXISTS ( SELECT 1 FROM allocations a WHERE ((a.work_order_id = w.id) AND (a.release = 'released'::release_status))))))
UNION ALL
 SELECT 'harvest_mass_balance_exceptions'::text, count(*) FROM harvest_grades WHERE ((harvest_grades.dry_input_g > (0)::numeric) AND (abs(harvest_grades.variance_g) > 0.01))
UNION ALL
 SELECT 'licenses_expiring_60d'::text, count(*) FROM licenses WHERE ((licenses.status = 'active'::text) AND (licenses.expires_on <= (CURRENT_DATE + 60)))
UNION ALL
 SELECT 'open_p0_actions'::text, count(*) FROM actions_register WHERE ((actions_register.priority = 'P0'::text) AND (actions_register.status <> 'complete'::text))
UNION ALL
 SELECT 'metrc_reconciliation_open'::text, count(*) FROM reconciliation_exceptions WHERE (reconciliation_exceptions.status = 'open'::text)
UNION ALL
 SELECT 'days_since_cash_update'::text, COALESCE(EXTRACT(day FROM (now() - ( SELECT (max(cash_snapshots.as_of))::timestamp with time zone FROM cash_snapshots))), (999)::numeric)
UNION ALL
 SELECT 'hr_' || k.key, nullif(k.val, '')::numeric
   FROM hr.command_center_tiles(null) t, jsonb_each_text(t->'numbers') k(key, val)
  WHERE k.key in ('headcount', 'clocked_in', 'called_out', 'no_show', 'late', 'ot_employees', 'pending_pto', 'open_incidents', 'open_das', 'badges_expired', 'badges_30d', 'docs_pending_ack');

notify pgrst, 'reload schema';;
