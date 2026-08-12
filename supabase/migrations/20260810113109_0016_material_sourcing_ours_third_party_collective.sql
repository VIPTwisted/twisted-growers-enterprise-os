-- ---------------------------------------------------------------------------
-- 0016 — Ours, third party, and collective.
--
-- The owner's standing requirement: "we track ours, third party and collectively".
-- Material we grew and material we BOUGHT are different things. Counting purchased
-- fresh frozen as our production overstates yield; leaving it out of intake breaks
-- the mass balance. In 2024 that was 1,050.4 lb of fresh frozen and ~264 lb of trim.
--
-- Ownership is decided by ReceivedFromFacilityLicenseNumber against f_is_ours(),
-- never by company name -- "Twisted Growers LLC" appears under BOTH our licences
-- and matching on the name would fold internal transfers into third-party.
-- ---------------------------------------------------------------------------

create or replace view v_material_sourcing as
with base as (
  select p.license                                              as licence,
         p.raw->>'Label'                                        as tag,
         nullif(btrim(p.raw->>'LocationName'),'')               as room,
         coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
         nullif(p.raw->>'ReceivedFromFacilityName','')          as from_facility,
         nullif(p.raw->>'ReceivedFromFacilityLicenseNumber','') as from_licence,
         (p.raw->>'ReceivedDateTime')::timestamptz              as received_at,
         (p.raw->>'PackagedDate')::date                         as packaged_on,
         f_to_pounds(coalesce((p.raw->>'ReceivedQuantity')::numeric,0),
               coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')) as lb_received,
         case when coalesce((p.raw->>'Quantity')::numeric,0) > 0
                   and coalesce((p.raw->>'IsFinished')::boolean,false) = false
              then f_to_pounds((p.raw->>'Quantity')::numeric,
                     coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
              else 0 end                                        as lb_on_hand
  from metrc_packages p
)
select case
         when from_licence is null                then 'OURS — grown here'
         when f_is_ours(from_licence)             then 'OURS — moved between our own licences'
         else 'THIRD PARTY — bought in'
       end                                                      as ownership,
       coalesce(from_facility,'Twisted Growers LLC')            as counterparty,
       coalesce(from_licence,'—')                               as counterparty_licence,
       licence, category,
       extract(year from coalesce(received_at::date, packaged_on))::int as yr,
       count(*)                                                 as tags,
       round(sum(lb_received)::numeric,1)                       as lb_received,
       round(sum(lb_on_hand)::numeric,1)                        as lb_still_on_hand
from base
group by 1,2,3,4,5,6;

comment on view v_material_sourcing is
  'Ours / third party / collective. Ownership decided by licence via f_is_ours(), '
  'never by company name -- "Twisted Growers LLC" appears under BOTH our licences, '
  'so name-matching would fold internal transfers into third-party purchases.';

grant select on v_material_sourcing to authenticated;
;
