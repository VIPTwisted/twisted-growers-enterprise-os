-- ---------------------------------------------------------------------------
-- 0056 — The annual reconciliation as a VIEW, so it lands in the report suite with
-- the standard toolbar (search, date range, filters, group-by, column chooser,
-- saved views, row drill) rather than needing its own page.
-- One row per (financial year x schedule line), with period_start as the date
-- column the range control filters on.
-- ---------------------------------------------------------------------------
create or replace view v_rpt_inventory_reconciliation as
select make_date(y.yr,1,1)                                    as period_start,
       make_date(y.yr,12,31)                                  as period_end,
       y.yr::text                                             as financial_year,
       r.line_no,
       r.section,
       r.line_item,
       r.pounds,
       r.source                                               as basis_and_caveats
from generate_series(2024, extract(year from current_date)::int) as y(yr)
cross join lateral f_inventory_reconciliation(
     make_date(y.yr,1,1),
     least(make_date(y.yr,12,31), current_date)) r;

comment on view v_rpt_inventory_reconciliation is
  'Annual inventory reconciliation for accountants: one row per year per schedule '
  'line, from FIVE independent sources (harvest report, inbound manifests, outbound '
  'manifests, adjustment report, package mirror). NOT an identity -- the variance '
  'line is a real measurement and is allowed to be non-zero. Read basis_and_caveats '
  'before quoting any figure: it states where a counted position was unavailable.';

grant select on v_rpt_inventory_reconciliation to authenticated;
;
