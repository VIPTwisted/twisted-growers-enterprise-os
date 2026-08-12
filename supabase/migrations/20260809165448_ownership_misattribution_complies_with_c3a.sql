-- The C3a coverage view named this page in its own first run: "Third Party —
-- Wrongly Counted As Ours" showed item rows with neither document reachable.
-- I built it earlier today, hours after writing the brief that says every item
-- row carries both. A rule that catches its author on day one is the only kind
-- worth having.
--
-- E1 / CREATE OR REPLACE: the new columns are APPENDED, because Postgres refuses
-- to reorder or rename and that refusal is the guard rail.
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
  x.tag,
  x.item_name,
  coalesce(x.location, '(no location recorded)')                      as location,
  x.license,
  x.lab_testing_state,
  round(x.lb::numeric, 2)                                             as pounds,
  x.platform_says_ours,
  (x.g->>'all_ours')::boolean                                         as lineage_says_ours,
  x.g->'origin_names'                                                 as origins,
  x.g->'inbound_manifests'                                            as arrived_on,
  (x.g->>'lineage_packages')::int                                     as steps_back,
  jsonb_array_length(coalesce(x.g->'origin_licences','[]'::jsonb))    as distinct_origins,
  case
    when (x.g->>'any_outside')::boolean and x.platform_says_ours
         and jsonb_array_length(coalesce(x.g->'origin_licences','[]'::jsonb)) <= 1
      then 'WRONGLY OURS — wholly theirs'
    when (x.g->>'any_outside')::boolean and x.platform_says_ours
      then 'WRONGLY OURS — blended, proportion unknown'
    when (x.g->>'all_ours')::boolean and not x.platform_says_ours
      then 'WRONGLY THEIRS — lineage says we grew it'
    else 'agrees'
  end                                                                 as verdict,
  case
    when (x.g->>'any_outside')::boolean and x.platform_says_ours
         and jsonb_array_length(coalesce(x.g->'origin_licences','[]'::jsonb)) > 1
      then 'Made from ' || jsonb_array_length(x.g->'origin_licences')
           || ' different origins. Nothing records how much came from each, so this cannot be '
           || 'split between our production and theirs. Do not count the whole weight either way.'
    when (x.g->>'any_outside')::boolean and x.platform_says_ours
      then 'Single outside origin — this weight is theirs, not our production.'
    when (x.g->>'all_ours')::boolean and not x.platform_says_ours
      then 'We grew it, but the item definition came from another licence, so it reads as bought in.'
    else null
  end                                                                 as what_is_wrong,
  -- ---- C3a, appended -----------------------------------------------------
  d_coa.download_url                                                  as certificate_link,
  case
    when d_coa.storage_path is not null                then 'on file'
    when x.lab_testing_state = 'TestPassed'            then 'passed — certificate not yet fetched from Metrc'
    when x.lab_testing_state = 'TestFailed'            then 'FAILED testing'
    when x.lab_testing_state = 'NotSubmitted'          then 'never submitted for testing'
    when x.lab_testing_state is null                   then 'no test state recorded in Metrc'
    else x.lab_testing_state
  end                                                                 as certificate_says,
  d_man.download_url                                                  as manifest_link,
  case
    when d_man.storage_path is not null then 'on file'
    when x.g->'inbound_manifests'->>0 is not null
      then 'inbound manifest ' || (x.g->'inbound_manifests'->>0) || ' — document not yet fetched'
    else 'no manifest — packaged here, never transferred in'
  end                                                                 as manifest_says
from x
left join metrc_documents d_coa
       on d_coa.package_tag = x.tag and d_coa.doc_type ilike '%coa%'
left join metrc_documents d_man
       on d_man.manifest_number = (x.g->'inbound_manifests'->>0) and d_man.doc_type ilike '%manifest%';

grant select on v_ownership_misattribution to authenticated;
revoke all on v_ownership_misattribution from anon;;
