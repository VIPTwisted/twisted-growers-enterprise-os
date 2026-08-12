-- ---------------------------------------------------------------------------
-- 0046 — Include INTERNAL transfers as package-level deductions.
--
-- The first reconstruction reproduced only 20.9% of today's quantities and
-- OVERSTATED by 11,405.7 lb. The cause was one excluded event class: I skipped
-- transfers to our own other licence, reasoning that they "net to zero
-- company-wide". That is true of the COMPANY'S TOTAL and false of EVERY PACKAGE.
--
-- When a package moves MC281714 -> MP281909 the SOURCE TAG IS CONSUMED and a NEW
-- TAG is created at the destination with its own CreatedQuantity. So the source
-- must be deducted and the new tag is already counted by its own CREATED event.
-- Including both is self-balancing; including neither loses the deduction, which
-- is exactly the 10,190.6 lb of internal movement across the three years.
--
-- A ledger is per-package. Company-level netting reasoning does not belong in it.
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
-- 2 · SHIPPED OUT — INCLUDING to our own other licence. The source tag is consumed
--     wherever it goes; the receiving licence creates a NEW tag with its own
--     CREATED event, so counting both is self-balancing.
select t.package_tag, t.received_on, 'SHIPPED',
       -abs(coalesce(t.shipped_lb,0)), t.licence, null,
       coalesce(t.destination_facility, t.destination_licence)
from metrc_rpt_package_transfers t
where t.shipped_lb is not null and t.shipped_lb <> 0

union all
-- 3 · ADJUSTED
select a.package_tag, a.adjusted_on, 'ADJUSTED',
       f_to_pounds(a.quantity, a.uom), a.licence, null, a.reason
from metrc_rpt_adjustments a
where a.quantity is not null and a.quantity <> 0

union all
-- 4 · CONSUMED INTO A CHILD — the manufacturing conversion, pro-rata by parent count
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
  'Every event that changed a package''s weight: CREATED, SHIPPED (including to our '
  'own other licence -- the source tag is consumed wherever it goes), ADJUSTED, and '
  'CONSUMED INTO CHILD (the manufacturing conversion). Multi-parent children split '
  'PRO-RATA, which is a stated assumption: Metrc does not record the split.';

grant select on v_package_events to authenticated;
;
