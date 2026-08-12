-- ---------------------------------------------------------------------------
-- 0051 — Canonical transfer line, with Metrc's OWN recorded weight.
--
-- shipped_lb was derived by matching our own item catalogue for a unit of measure,
-- so it resolved only for OUR items and returned NULL for every third-party inbound
-- line -- which is why inbound purchases showed as 0.0 lb. The raw export already
-- carries "Weight Ship'd" / "Weight Rcv'd" ALREADY IN POUNDS (6,810 g -> 15.013).
-- It covers 17,668 rows against 16,086, and agrees with the derived value on 14,529
-- of 14,663 overlaps (99.1%). Where they disagree, Metrc's own number wins.
-- ---------------------------------------------------------------------------
create or replace view v_transfer_line as
select t.manifest_number,
       t.package_tag,
       t.received_on,
       coalesce(nullif(t.source_row->>'Origin Lic.',''),  t.licence)             as origin_licence,
       coalesce(nullif(t.source_row->>'Dest. Lic.',''),   t.destination_licence) as dest_licence,
       nullif(t.source_row->>'Origin Facility','')                               as origin_facility,
       coalesce(nullif(t.destination_facility,''), nullif(t.source_row->>'Destination Facility','')) as dest_facility,
       -- Metrc's recorded pounds first, our derived value only as a fallback
       coalesce(case when (t.source_row->>'Weight Ship''d') ~ '^[0-9]+(\.[0-9]+)?$'
                     then (t.source_row->>'Weight Ship''d')::numeric end,
                t.shipped_lb)                                                    as pounds,
       case when (t.source_row->>'Weight Ship''d') ~ '^[0-9]+(\.[0-9]+)?$'
            then 'Metrc Weight Ship''d' else 'derived from item catalogue UoM' end as weight_source,
       t.item, t.category, t.strain, t.status,
       t.source_row->>'Type'                                                     as transfer_type,
       coalesce((t.source_row->>'Voided')::text,'False')                         as voided,
       f_is_ours(coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence))    as origin_is_ours,
       f_is_ours(coalesce(nullif(t.source_row->>'Dest. Lic.',''),  t.destination_licence)) as dest_is_ours,
       case
         when f_is_ours(coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence))
          and f_is_ours(coalesce(nullif(t.source_row->>'Dest. Lic.',''),  t.destination_licence))
              then 'INTERNAL'
         when f_is_ours(coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence))
              then 'OUTBOUND'
         when f_is_ours(coalesce(nullif(t.source_row->>'Dest. Lic.',''),  t.destination_licence))
              then 'INBOUND'
         else 'THIRD PARTY BOTH ENDS' end                                        as direction
from metrc_rpt_package_transfers t;

comment on view v_transfer_line is
  'One row per package per manifest leg, with Metrc''s own recorded pounds. '
  'direction: OUTBOUND left the company (a sale), INBOUND is a purchase or return, '
  'INTERNAL is MC <-> MP and is NOT a sale -- counting internal legs as sales '
  'double-counts the same physical material.';

grant select on v_transfer_line to authenticated;
;
