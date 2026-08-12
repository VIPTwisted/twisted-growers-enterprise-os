-- TWO DEFECTS, AND THE SLOW ONE WAS THE LESSER.
--
-- v_remediation_yield joined v_third_party_downstream TO ITSELF on source_tag:
--     FROM v_third_party_downstream src
--     JOIN v_third_party_downstream child ON child.source_tag = src.source_tag
--     GROUP BY src.source_tag, ...
--
-- 1. CORRECTNESS. Every row for a tag joins every other row for that tag, so a
--    tag with N children produces N x N rows in its group. count(*) becomes N
--    squared and sum(made_qty) becomes N times the true sum. 87 of 271 tags have
--    more than one child and the worst has 16.
--
--    Measured: the page reported output_qty 1,457,157 against a true 791,913 —
--    84% overstated overall, and up to 16x on an individual row.
--
--    That figure is recovery_pct: sellable product out per pound bought in. Rule
--    C6a names it as THE measure for third-party material — "the measure that
--    matters for it is remediation yield". The headline metric of the bought-in
--    business was inflated, on a page nobody could wait for.
--
-- 2. SPEED. The self-join evaluates a 31-second view twice, which is why the
--    page took 82.9 seconds and was slow in all 72 canary runs in 24 hours.
--
-- Both fixed by the same change: aggregate the children ONCE per source tag. The
-- src columns are per-tag already, so they need no join to reach.
create or replace view v_remediation_yield as
select
  supplier,
  source_tag,
  source_item,
  strain,
  received_qty                                                       as material_in,
  source_uom,
  count(*)                                                           as products_made,
  round(sum(made_qty))                                               as output_qty,
  string_agg(distinct made_into_category, ', ')                      as became,
  round(100.0 * sum(made_qty) / nullif(received_qty, 0::numeric), 1) as recovery_pct,
  count(*) filter (where made_lab_state = 'TestPassed')              as output_passed,
  count(*) filter (where made_lab_state = 'TestFailed')              as output_failed
from v_third_party_downstream
group by supplier, source_tag, source_item, strain, received_qty, source_uom
order by received_qty desc nulls last;

comment on view v_remediation_yield is
  'Sellable product out per unit bought in, per source package — rule C6a''s measure for third-party material. Corrected 9 Aug 2026: it self-joined v_third_party_downstream on source_tag, so a tag with N children counted N squared products and N times the output. Reported 1,457,157 against a true 791,913. Fixing the join also removed a duplicate evaluation of a 31-second view, taking the page from 82.9s.';;
