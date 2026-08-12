-- Agent G, 9 Aug 2026. Two fixes, both raised by tools/checks/apex-registry-vs-spec.mjs on
-- its FIRST run, against rows this agent had added minutes earlier. Recorded rather than
-- quietly corrected, because a gate that catches its own author on day one is the evidence
-- that it is not a check that cannot fail.
--
-- UNDO: alter table apex_entity drop column pull_mode;
--       update apex_entity set root_key='data' where entity='marketplace';

-- 1. WRONG ROOT KEY. /v1/marketplace returns { "available_inventory": [...] } - it is the
--    same collection shape as /v1/available-inventory, browsing other companies rather than
--    our own. Declared as "data" and it would have aborted on first pull.
update apex_entity set root_key = 'available_inventory',     -- was 'data'
  why = why || ' | 9 Aug 2026: root_key corrected data -> available_inventory; caught by apex-registry-vs-spec on its first run.'
where entity = 'marketplace';

-- 2. THE REAL DEFECT UNDERNEATH. Two endpoints are called DIRECTLY by apex-sync rather than
--    driven from this table: /v1/welcome (proves the key and enumerates scopes before the
--    loop) and /v1/usage (credit budget, read before and after). The registry had no way to
--    say so, so welcome carried a root_key it does not have, and usage is skipped by a
--    hardcoded `if (e.entity === "usage") continue` in the edge function - a branch in code
--    where rule G1 requires a row.
--
--    pull_mode makes the distinction data. 'direct' rows are still declared, so they stay in
--    the completeness denominator, but the response-shape rules do not apply to them.
alter table apex_entity
  add column if not exists pull_mode text not null default 'loop'
  check (pull_mode in ('loop', 'direct'));

comment on column apex_entity.pull_mode is
  'loop = pulled by the apex-sync entity loop and must satisfy the response-shape rules. '
  'direct = called explicitly by the worker outside the loop (welcome, usage), so root_key, '
  'supports_delta and supports_paging do not describe it. Declared either way, because '
  'apex_entity is the denominator for every completeness figure and an endpoint missing from '
  'it makes "fully imported" unfalsifiable.';

update apex_entity set pull_mode = 'direct', root_key = null
where entity in ('welcome', 'usage');;
