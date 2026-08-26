create or replace view public.v_xq_never_submitted
with (security_invoker = true) as
with rule as (
  select f_rule('ageing_stock_days') as ageing_days
),
p as (
  select distinct on (tag) tag, quantity, uom, license, synced_at, raw
  from metrc_packages
  where provenance = 'metrc api'
  order by tag, synced_at desc nulls last
)
select
  'Never submitted for testing'::text as queue,
  n.metrc_tag                       as package_tag,
  n.metrc_licence                   as licence,
  n.item,
  n.category,
  n.metrc_room,
  n.sublocation,
  n.metrc_quantity                  as quantity_in_its_own_unit,
  p.quantity                        as quantity_number,
  p.uom                             as quantity_unit,
  case when f_is_weight(p.uom) then round(f_to_pounds(p.quantity, p.uom), 2) end as pounds,
  n.metrc_lab_state,
  n.metrc_packaged_on               as packaged_on,
  n.days_in_facility,
  n.from_harvest,
  n.production_batch,
  n.arrived_on_manifest,
  n.on_hold,
  case
    when n.metrc_lab_state = 'NotRequired'                       then '4 METRC SAYS TESTING IS NOT REQUIRED'
    when n.days_in_facility > r.ageing_days                      then '1 NEVER SUBMITTED AND PAST THE AGEING THRESHOLD'
    when n.metrc_room ilike '%vault%'
      or n.metrc_room ilike '%fulfil%'                           then '2 NEVER SUBMITTED AND STAGED FOR FULFILMENT'
    else                                                              '3 NEVER SUBMITTED, IN A PRODUCTION ROOM'
  end as severity,
  case
    when n.metrc_lab_state = 'NotRequired' then
      'Metrc records this package as not requiring a test. It is listed so the count is complete, not because it is a problem.'
    when n.days_in_facility > r.ageing_days then
      'Held ' || n.days_in_facility || ' days - past the ' || r.ageing_days || ' day ageing threshold - and Metrc still reads ' || n.metrc_lab_state || '. No sample was ever submitted.'
    when n.metrc_room ilike '%vault%' or n.metrc_room ilike '%fulfil%' then
      'Sitting in ' || n.metrc_room || ', which is a fulfilment location, and Metrc reads ' || n.metrc_lab_state || '. Nothing untested should ship.'
    else
      'In ' || n.metrc_room || ' for ' || n.days_in_facility || ' days, Metrc reads ' || n.metrc_lab_state || '. Whether an in-process package in this room is expected to stay untested is an open question for the owner.'
  end as what_is_wrong,
  case
    when n.metrc_lab_state = 'NotRequired' then 'Nothing. Confirm once that the item category genuinely carries no test requirement.'
    else 'Find the package on the floor, confirm what it is, and either submit a sample or record why it will never need one. Do not ship it until one or the other is done.'
  end as what_to_do,
  n.proof                                    as metrc_proof,
  n.lab_results                              as lab_result_rows_found,
  n.manifest_lines                           as manifest_lines_found,
  n.own_certificate                          as certificates_found,
  'metrc_packages (Metrc API mirror), via v_never_tested_proof'::text as metrc_source,
  p.synced_at::date                          as metrc_as_of,
  'ageing_stock_days'::text                  as rule_used,
  r.ageing_days                              as rule_value,
  'Only the packages the Metrc API returns carry a LabTestingState. Packages that exist only as Metrc report rows cannot be assessed here; see v_xq_summary for that count.'::text as population_caveat
from v_never_tested_proof n
cross join rule r
left join p on p.tag = n.metrc_tag
order by severity, n.days_in_facility desc;

comment on view public.v_xq_never_submitted is
'TICKET C2 QUEUE 2. Live Metrc packages that were never submitted for testing. Built on v_never_tested_proof so every row carries Metrc''s own proof and self-refutes if a lab result, manifest or certificate contradicts the claim.';;
