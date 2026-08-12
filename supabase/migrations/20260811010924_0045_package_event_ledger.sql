-- ---------------------------------------------------------------------------
-- 0045 — THE PACKAGE EVENT LEDGER. Reconstructed, because there is no one report.
--
-- Owner, 10 Aug 2026: "you have to figure all this out with all the reports and
-- locations!!! there is no one fucking magic report!!! you reverse engineer this
-- with reports you have."
--
-- He is right, and asking for an Inventory Point in Time with weights was me
-- looking for a shortcut. Metrc's package API gives only TODAY'S quantity -- but
-- every EVENT that changed it is recorded somewhere we already hold:
--
--   CREATED    metrc_packages.CreatedQuantity on PackagedDate
--   SHIPPED    metrc_rpt_package_transfers.shipped_qty on received_on
--   ADJUSTED   metrc_rpt_adjustments.quantity on adjusted_on
--   CONSUMED   a child's CreatedQuantity draws its PARENT down on the child's
--              PackagedDate -- SourcePackageLabels names the parent. THIS is the
--              manufacturing conversion that was said to be missing. It is not
--              missing; it was never assembled.
--
-- Running-sum those events and you have every package's weight on ANY date, which
-- is what a point-in-time report would have given. The method is VALIDATED against
-- today's known quantity in v_ledger_validation -- if the reconstruction cannot
-- reproduce today, it may not be trusted for 31 Dec 2024.
--
-- MULTI-PARENT CHILDREN ARE SPLIT PRO-RATA across their named parents, and flagged,
-- because Metrc does not record how much came from each. A blend of four parents
-- attributes a quarter to each, which is a stated assumption, not a fact.
-- ---------------------------------------------------------------------------

create or replace view v_package_events as
-- 1 · CREATED
select p.raw->>'Label'                                   as package_tag,
       (p.raw->>'PackagedDate')::date                    as event_date,
       'CREATED'::text                                   as event,
       f_to_pounds(coalesce((p.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))  as lb_delta,
       p.license                                         as licence,
       coalesce(nullif(p.raw->>'LocationName',''),'(no room)') as room,
       null::text                                        as counterparty
from metrc_packages p
where f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
  and coalesce((p.raw->>'CreatedQuantity')::numeric,0) > 0

union all
-- 2 · SHIPPED OUT
select t.package_tag, t.received_on, 'SHIPPED',
       -abs(coalesce(t.shipped_lb,0)), t.licence, null,
       coalesce(t.destination_facility, t.destination_licence)
from metrc_rpt_package_transfers t
where t.shipped_lb is not null and t.shipped_lb <> 0
  and not f_is_ours(coalesce(t.destination_licence,''))   -- internal moves net to zero company-wide

union all
-- 3 · ADJUSTED
select a.package_tag, a.adjusted_on, 'ADJUSTED',
       f_to_pounds(a.quantity, a.uom), a.licence, null, a.reason
from metrc_rpt_adjustments a
where a.quantity is not null and a.quantity <> 0

union all
-- 4 · CONSUMED INTO A CHILD -- the manufacturing conversion, pro-rata by parent count
select btrim(parent.tag), (c.raw->>'PackagedDate')::date, 'CONSUMED INTO CHILD',
       -(f_to_pounds(coalesce((c.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(c.raw->>'UnitOfMeasureName',''),'Grams'))
         / greatest(array_length(string_to_array(c.raw->>'SourcePackageLabels', ', '),1),1)),
       c.license, null, c.raw->>'Label'
from metrc_packages c,
     lateral unnest(string_to_array(c.raw->>'SourcePackageLabels', ', ')) as parent(tag)
where nullif(c.raw->>'SourcePackageLabels','') is not null
  and f_is_weight(coalesce(nullif(c.raw->>'UnitOfMeasureName',''),'Grams'))
  and coalesce((c.raw->>'CreatedQuantity')::numeric,0) > 0;

comment on view v_package_events is
  'Every event that changed a package''s weight: CREATED, SHIPPED, ADJUSTED, and '
  'CONSUMED INTO CHILD. The last is the manufacturing conversion -- a child''s '
  'created weight draws its parent down on the child''s packaged date. Multi-parent '
  'children split PRO-RATA and that is an assumption, not a fact: Metrc does not '
  'record how much came from each parent.';

grant select on v_package_events to authenticated;


-- Does the reconstruction reproduce TODAY? If not, it cannot be trusted for any date.
create or replace view v_ledger_validation as
with rebuilt as (
  select package_tag, round(sum(lb_delta)::numeric,3) as reconstructed_lb
  from v_package_events group by 1
),
actual as (
  select p.raw->>'Label' as package_tag,
         round(f_to_pounds(coalesce((p.raw->>'Quantity')::numeric,0),
               coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) as actual_lb
  from metrc_packages p
  where f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
)
select count(*)                                                          as tags,
       count(*) filter (where abs(r.reconstructed_lb - a.actual_lb) < 0.01) as matches_within_0_01_lb,
       count(*) filter (where abs(r.reconstructed_lb - a.actual_lb) >= 0.01) as differs,
       round(100.0*count(*) filter (where abs(r.reconstructed_lb - a.actual_lb) < 0.01)/count(*),1) as pct_reproduced,
       round(sum(r.reconstructed_lb),1)                                   as total_reconstructed_lb,
       round(sum(a.actual_lb),1)                                          as total_actual_lb,
       round(sum(r.reconstructed_lb) - sum(a.actual_lb),1)                as total_variance_lb
from rebuilt r join actual a on a.package_tag = r.package_tag;

comment on view v_ledger_validation is
  'THE HONESTY CHECK. Rebuilds every package from its events and compares to the '
  'quantity Metrc reports today. A reconstruction that cannot reproduce TODAY must '
  'never be used to state a position at 31 Dec 2024.';

grant select on v_ledger_validation to authenticated;
;
