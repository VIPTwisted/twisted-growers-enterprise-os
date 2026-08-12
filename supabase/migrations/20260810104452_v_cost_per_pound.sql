-- Cost per saleable pound, with the denominator done correctly.
--
-- Owner, 10 Aug 2026: "we have to use P&L to figure out cost per pound."
--
-- ⚠ THE NUMERATOR IS NOT ACCOUNTS. There is no P&L in this system. overhead_items holds ONE
-- owner-stated row - $285,000/month, wages included, not itemised - and its own source note
-- says "QuickBooks or an uploaded profit and loss statement replaces this". Every figure here
-- is therefore PROVISIONAL and says so on its face (rules A2, A3).
--
-- ⚠ THE DENOMINATOR WAS THE REAL FAULT. Fresh frozen is packaged WET at roughly 4.5:1.
-- Adding it to dried flower at face weight inflates output and understates cost per pound -
-- rule B3, the trap that once overstated open harvests by 3,800 lb. Measured 10 Aug 2026 for
-- Jan-Jul 2026: adding wet raw gives 4,320.9 lb and $461.71/lb; converting to dry-equivalent
-- gives 2,601.7 lb and $766.81/lb. A 66% difference from one conversion.
--
-- The superseded $591.39 was $285,000 x 6 / 2,891.5 lb and sits between the two, which is
-- what a partly-converted denominator looks like.

create or replace view v_cost_per_pound as
with months as (
  select date_trunc('month', h.finished_on)::date as month,
         sum(h.dry_yield_lb) filter (where h.drying_kind = 'dried')             as dried_lb,
         sum(h.dry_yield_lb) filter (where h.drying_kind like 'fresh frozen%')  as ff_wet_lb,
         count(*)                                                               as harvests
  from v_harvest_water_and_yield h
  where h.harvest_state = 'CLOSED' and h.finished_on is not null
  group by 1
),
rate as (
  select coalesce(f_rule('fresh_frozen_wet_to_dry'), 4.5) as ff_ratio
),
overhead as (
  select sum(monthly_amount) as monthly_overhead,
         max(source)         as overhead_source
  from overhead_items
  where effective_to is null
)
select
  m.month,
  m.harvests,
  round(coalesce(m.dried_lb,0)::numeric, 1)                              as dried_lb,
  round(coalesce(m.ff_wet_lb,0)::numeric, 1)                             as fresh_frozen_wet_lb,
  round((coalesce(m.ff_wet_lb,0)/r.ff_ratio)::numeric, 1)                as fresh_frozen_dry_equiv_lb,
  round((coalesce(m.dried_lb,0) + coalesce(m.ff_wet_lb,0)/r.ff_ratio)::numeric, 1)
                                                                          as saleable_dry_equiv_lb,
  o.monthly_overhead,
  case when coalesce(m.dried_lb,0) + coalesce(m.ff_wet_lb,0)/r.ff_ratio > 0
       then round((o.monthly_overhead
             / (coalesce(m.dried_lb,0) + coalesce(m.ff_wet_lb,0)/r.ff_ratio))::numeric, 2) end
                                                                          as cost_per_lb_this_month,
  -- a single month is NOT a cost per pound: harvests land on a 14-day pull cadence while
  -- overhead is constant, so one month swings from $269 to $4,516. Use the trailing figure.
  round((sum(o.monthly_overhead) over w
         / nullif(sum(coalesce(m.dried_lb,0) + coalesce(m.ff_wet_lb,0)/r.ff_ratio) over w,0))::numeric, 2)
                                                                          as cost_per_lb_trailing_12m,
  'PROVISIONAL — owner-stated overhead, not accounts. '||left(o.overhead_source, 160)
                                                                          as numerator_provenance,
  'Fresh frozen converted to dry-equivalent at '||r.ff_ratio||':1 before adding to dried flower '
  || '(rule B3). Adding it wet would understate cost per pound by roughly 40%.'
                                                                          as denominator_method,
  'A single month is not a cost per pound — harvests are lumpy on a 14-day pull cadence and '
  || 'overhead is constant. Read the trailing 12-month column.'            as how_to_read_it
from months m
cross join rate r
cross join overhead o
window w as (order by m.month rows between 11 preceding and current row);

comment on view v_cost_per_pound is
  'Cost per saleable pound. PROVISIONAL: the numerator is one owner-stated overhead row, not a '
  'P&L — there is no P&L in this system. The denominator converts fresh frozen to dry-equivalent '
  'before adding it to dried flower (rule B3); adding it wet understates cost per pound by about '
  '40%. Read the trailing 12-month column: a single month divides constant overhead by a lumpy '
  'harvest cadence and is meaningless.';;
