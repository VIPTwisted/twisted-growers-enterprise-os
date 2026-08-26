insert into nav_registry
  (category, category_order, subcategory, label, item_order, icon, view_key,
   table_ref, description, enabled, surface, page_kind, module, archetype)
select 'Metrc', n.category_order, 'Exception Queues',
       'Metrc Exception Queues', 910, 'alert-triangle',
       'xq_metrc_exceptions', 'v_xq_summary',
       'Four Metrc-driven exception queues on one page: harvest moisture and residual, packages never submitted for testing, failed tests with no disposition, and harvests open past the 28-day limit. Every figure states the Metrc table it came from and the date that source was captured.',
       true, 'side', 'custom', 'metrc', 'issue_queue'
from (select coalesce(max(category_order), 0) as category_order
        from nav_registry where category = 'Metrc') n
where not exists (select 1 from nav_registry x where x.view_key = 'xq_metrc_exceptions');

insert into tile_drill_contract
  (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance, registered_by, registered_at)
values
  ('xq.moisture.items', 'Metrc Exception Queues', 'Harvest moisture / residual',
   'select items::numeric from v_xq_summary where ord = 1',
   'select count(*)::numeric from v_xq_harvest_moisture',
   0, 'ZERO. The tile is a count of its own drill. Any gap is a bug.', 'Agent I (Claude), ticket C2', now()),
  ('xq.never_submitted.items', 'Metrc Exception Queues', 'Never submitted for testing',
   'select items::numeric from v_xq_summary where ord = 2',
   'select count(*)::numeric from v_xq_never_submitted',
   0, 'ZERO. The tile is a count of its own drill. Any gap is a bug.', 'Agent I (Claude), ticket C2', now()),
  ('xq.failed_no_disposition.items', 'Metrc Exception Queues', 'Failed test, no disposition',
   'select items::numeric from v_xq_summary where ord = 3',
   'select count(*)::numeric from v_xq_failed_no_disposition',
   0, 'ZERO. The tile is a count of its own drill. Any gap is a bug.', 'Agent I (Claude), ticket C2', now()),
  ('xq.harvest_open.items', 'Metrc Exception Queues', 'Harvest open past the limit',
   'select items::numeric from v_xq_summary where ord = 4',
   'select count(*)::numeric from v_xq_harvest_open_past_limit',
   0, 'ZERO. The tile is a count of its own drill. Any gap is a bug.', 'Agent I (Claude), ticket C2', now()),
  ('xq.harvest_open.matches_v_overdue_harvests', 'Metrc Exception Queues', 'Harvest open past the limit',
   'select count(*)::numeric from v_xq_harvest_open_past_limit',
   'select count(*)::numeric from v_overdue_harvests',
   0, 'ZERO. Queue 4 is a provenance wrapper over v_overdue_harvests and must never add or drop a harvest. If these diverge the wrapper has started re-deriving the rule, which is the thing it exists not to do.', 'Agent I (Claude), ticket C2', now())
on conflict (contract_key) do nothing;;
