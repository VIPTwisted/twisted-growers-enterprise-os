-- Three defects in the issue-register view for failed material.
--
-- 1. UNIT BLINDNESS. It divided quantity / 453.592 whatever the unit was - the same
--    bug that once lost 18.2 lb in v_lab_results. All 10 current rows happen to be
--    grams so no number moves today; the first failed package recorded in lb or as
--    a countable item would have been mis-valued silently. Now f_to_pounds/f_is_weight.
--
-- 2. NOT DISPOSITION-AWARE. v_real_loss and v_item_flags_all were both wired to
--    failed_material_disposition; this view was not. A package with a recorded
--    ruling would have kept appearing on the issue register for ever. Rule H1 says
--    an issue moves to where it belongs - it has to be able to LEAVE too.
--
-- 3. WRONG COST BASIS ON OTHER PEOPLE'S MATERIAL. It valued every package at OUR
--    cultivation cost per pound. Bought-in failed material was purchased at a
--    discount and material_purchases is EMPTY, so what was paid for it exists
--    nowhere. Valuing it at our cost invents a number. It is now null for
--    third-party material, with cost_basis saying why.
--
-- UNDO: the previous definition is in this migration's predecessor; re-issue it.

create or replace view public.v_issue_failed_testing as
select
    p.license,
    p.tag                                                as package_tag,
    p.item_name,
    p.quantity,
    p.uom,
    p.location,
    p.packaged_on,
    current_date - p.packaged_on                         as days_held,
    nullif(p.raw ->> 'SourceHarvestNames', '')           as source_harvest,
    case when f_is_ours(p.raw ->> 'ItemFromFacilityLicenseNumber')
              and f_is_weight(p.uom)
         then round(f_to_pounds(p.quantity, p.uom) *
                    (select cm.cost_per_pound from cost_model cm
                      where cm.scope = 'cultivation'
                      order by cm.effective_from desc limit 1), 0)
    end                                                  as value_at_cost,
    'THE ISSUE: this package failed laboratory testing and is still sitting in active inventory. It cannot legally be sold.'
                                                         as what_is_wrong,
    'Record the ruling in failed_material_disposition: bought_for_remediation, remediate_in_house, sell_for_remediation or destroy. Only destroy counts as a loss. Then record it in Metrc.'
                                                         as what_to_do,
    -- appended below the original twelve columns
    case when f_is_weight(p.uom) then round(f_to_pounds(p.quantity, p.uom), 2) end
                                                         as pounds,
    case when f_is_ours(p.raw ->> 'ItemFromFacilityLicenseNumber')
         then 'OURS' else 'BOUGHT IN' end                as whose_material,
    p.raw ->> 'ItemFromFacilityName'                     as made_by,
    case when not f_is_weight(p.uom)
         then 'Countable item - no weight, so no pound value.'
         when f_is_ours(p.raw ->> 'ItemFromFacilityLicenseNumber')
         then 'Our cultivation cost per pound, from cost_model.'
         else 'UNKNOWN. Bought in, most likely at a discount to remediate. material_purchases is empty, so what was paid exists nowhere. Our cultivation cost does NOT apply to someone else''s material.'
    end                                                  as cost_basis
from metrc_packages p
where p.lab_testing_state = 'TestFailed'
  and p.source_state = any (array['active','onhold'])
  and not exists (select 1 from failed_material_disposition fd
                   where fd.package_tag = p.tag
                     and fd.superseded_at is null)
order by 10 desc nulls last;

comment on view public.v_issue_failed_testing is
  'Failed packages still in active inventory with NO disposition recorded. Leaves '
  'this view the moment a ruling is written to failed_material_disposition. '
  'value_at_cost is populated for OUR material only - bought-in material was bought '
  'at a discount that is recorded nowhere, so any figure for it would be invented.';;
