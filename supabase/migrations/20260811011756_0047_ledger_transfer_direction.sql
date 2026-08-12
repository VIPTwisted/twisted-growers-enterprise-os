-- ---------------------------------------------------------------------------
-- 0047 — Transfer rows have a DIRECTION. I was treating all of them as outflows.
--
-- metrc_rpt_package_transfers holds BOTH legs of every movement, because we import
-- the report from both licences. The `licence` column is NOT the origin -- it is
-- whichever licence's report the row came from. Direction lives only in
-- source_row->>'Origin Lic.' / 'Dest. Lic.'.
--
-- Proof this was wrong: tag ...6048 read CREATED +77.2, SHIPPED -77.2, and still
-- had 77.2 lb physically on the shelf. Tag ...5085 was "shipped" 29.3 lb having
-- only ever been created with 15.0 -- more than ever existed.
--
-- Rules now:
--   OUTFLOW  Origin Lic. = the package's own licence.
--   INFLOW   Dest. Lic. = the package's own licence AND received after PackagedDate.
--            (A receipt ON the packaged date is the event that CREATED the tag and
--            is already counted as CREATED; adding it would double-count.)
-- ---------------------------------------------------------------------------

create or replace view v_package_events as
with pkg as (
  select p.raw->>'Label' as tag, p.license as lic,
         (p.raw->>'PackagedDate')::date as packaged_on
  from metrc_packages p
),
xfer as (
  select t.package_tag, t.received_on, t.shipped_lb, t.manifest_number,
         coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence) as origin_lic,
         coalesce(nullif(t.source_row->>'Dest. Lic.',''),  t.destination_licence) as dest_lic,
         t.destination_facility, t.source_row->>'Origin Facility' as origin_facility
  from metrc_rpt_package_transfers t
  where t.shipped_lb is not null and t.shipped_lb <> 0
)
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
-- 2 · SHIPPED OUT — only when WE are the origin of that leg
select x.package_tag, x.received_on, 'SHIPPED',
       -abs(x.shipped_lb), k.lic, null,
       coalesce(x.destination_facility, x.dest_lic)
from xfer x join pkg k on k.tag = x.package_tag
where upper(btrim(x.origin_lic)) = upper(btrim(k.lic))

union all
-- 3 · RECEIVED BACK IN — a later inbound leg (e.g. a return), never the creating receipt
select x.package_tag, x.received_on, 'RECEIVED',
       abs(x.shipped_lb), k.lic, null,
       coalesce(x.origin_facility, x.origin_lic)
from xfer x join pkg k on k.tag = x.package_tag
where upper(btrim(x.dest_lic)) = upper(btrim(k.lic))
  and upper(btrim(coalesce(x.origin_lic,''))) <> upper(btrim(k.lic))
  and x.received_on > k.packaged_on

union all
-- 4 · ADJUSTED
select a.package_tag, a.adjusted_on, 'ADJUSTED',
       f_to_pounds(a.quantity, a.uom), a.licence, null, a.reason
from metrc_rpt_adjustments a
where a.quantity is not null and a.quantity <> 0

union all
-- 5 · CONSUMED INTO A CHILD — the manufacturing conversion, pro-rata across parents
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
  'Every recorded event that changed a package''s weight. Transfer direction is read '
  'from source_row Origin Lic./Dest. Lic. -- the `licence` column is the reporting '
  'licence, NOT the origin. A receipt dated on the package''s own PackagedDate is the '
  'event that created the tag and is counted once, as CREATED. Multi-parent children '
  'split PRO-RATA: that is an ASSUMPTION, not a measurement -- Metrc does not record '
  'the split. 77.2% of converted weight is single-parent and therefore exact.';

grant select on v_package_events to authenticated;
;
