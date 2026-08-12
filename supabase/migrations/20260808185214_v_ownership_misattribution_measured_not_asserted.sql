-- HOW MUCH OF WHAT WE CALL OUR PRODUCTION IS SOMEBODY ELSE'S MATERIAL.
--
-- The platform decides ownership by reading ONE field on the package:
-- ItemFromFacilityLicenseNumber. When a package is repackaged in Metrc the child
-- does not inherit its parent's provenance, so that one field describes the item
-- definition, not the material. f_material_origin walks the actual lineage.
--
-- Measured 8 Aug 2026 across 862 packages holding stock, 2,554.7 lb:
--   440.5 lb over 301 packages the platform calls OURS, lineage says outside
--   107.0 lb over  24 packages the platform calls THEIRS, lineage says ours
--   21.4% of on-hand pounds sit on the wrong side of the line.
--
-- ⚠ THE FIGURE THAT MUST NOT BE OVERSTATED. Of that 440.5 lb, only 93.6 lb over
-- 38 packages has a SINGLE outside origin and is wholly theirs. The other
-- 346.9 lb is blended from 2 to 7 origins and may contain our material too, and
-- NOTHING RECORDS THE PROPORTIONS. So the defensible floor is 93.6 lb; the
-- ceiling is 440.5 lb; the truth is between and cannot be computed from what
-- exists. Reporting the ceiling as fact would repeat the mistakes this platform
-- has already made once each - the $61,815/lb price, the 12,166 lb that was
-- really 687, the "June was 100% freezer".
--
-- This view states the band and never collapses it to one number.
create or replace view v_ownership_misattribution as
with x as (
  select p.tag, p.item_name, p.location, p.license, p.lab_testing_state,
         f_to_pounds(p.quantity, p.uom)                               as lb,
         f_material_origin(p.tag)                                     as g,
         f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')           as platform_says_ours
  from metrc_packages p
  where p.quantity > 0
)
select
  tag,
  item_name,
  coalesce(location, '(no location recorded)')                        as location,
  license,
  lab_testing_state,
  round(lb::numeric, 2)                                               as pounds,
  platform_says_ours,
  (g->>'all_ours')::boolean                                           as lineage_says_ours,
  g->'origin_names'                                                   as origins,
  g->'inbound_manifests'                                              as arrived_on,
  (g->>'lineage_packages')::int                                       as steps_back,
  jsonb_array_length(coalesce(g->'origin_licences','[]'::jsonb))      as distinct_origins,
  case
    when (g->>'any_outside')::boolean and platform_says_ours
         and jsonb_array_length(coalesce(g->'origin_licences','[]'::jsonb)) <= 1
      then 'WRONGLY OURS — wholly theirs'
    when (g->>'any_outside')::boolean and platform_says_ours
      then 'WRONGLY OURS — blended, proportion unknown'
    when (g->>'all_ours')::boolean and not platform_says_ours
      then 'WRONGLY THEIRS — lineage says we grew it'
    else 'agrees'
  end                                                                 as verdict,
  case
    when (g->>'any_outside')::boolean and platform_says_ours
         and jsonb_array_length(coalesce(g->'origin_licences','[]'::jsonb)) > 1
      then 'Made from ' || jsonb_array_length(g->'origin_licences')
           || ' different origins. Nothing records how much came from each, so this cannot be '
           || 'split between our production and theirs. Do not count the whole weight either way.'
    when (g->>'any_outside')::boolean and platform_says_ours
      then 'Single outside origin — this weight is theirs, not our production.'
    when (g->>'all_ours')::boolean and not platform_says_ours
      then 'We grew it, but the item definition came from another licence, so it reads as bought in.'
    else null
  end                                                                 as what_is_wrong
from x;

comment on view v_ownership_misattribution is
  'Every package holding stock where the platform''s one-field ownership read disagrees with the lineage. Blended packages are marked as such and their weight must never be counted wholly to either side: the proportions are not recorded anywhere. Floor 93.6 lb wholly theirs, ceiling 440.5 lb touched by outside material, measured 8 Aug 2026.';

grant select on v_ownership_misattribution to authenticated;
revoke all on v_ownership_misattribution from anon;;
