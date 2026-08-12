-- THE META-TRAP, second form. The first form was 'not_yet_decided' silencing a flag.
-- This is the larger one, and it went live today.
--
-- Three of the four dispositions are COMMITMENTS TO DO WORK, not statements of fact:
--   remediate_in_house   - nothing is remediated until somebody remediates it
--   sell_for_remediation - nothing is sold until it ships
--   destroy              - nothing is destroyed until Metrc says so
-- Only bought_for_remediation is a CLASSIFICATION: it says what the material always
-- was (discounted feedstock, never a loss), and is therefore true the moment it is
-- recorded.
--
-- As built, recording ANY of the four removed the package from v_real_loss,
-- v_item_flags_all and v_issue_failed_testing. At the moment of writing this,
-- 2 packages / 57.0 lb of OUR OWN material carry 'remediate_in_house', still read
-- lab_testing_state = 'TestFailed' in Metrc, and appear on no board anywhere.
-- The decision was recorded. The work was not done. That is exactly the failure
-- mode the house rule was written for.
--
-- FIX: dispositions that promise work stay OPEN until completion is recorded with
-- evidence. v_remediation_owed carries them meanwhile.
-- UNDO: drop the two columns and the view; nothing else reads them yet.

alter table failed_material_disposition
  add column if not exists completed_at        timestamptz,
  add column if not exists completed_evidence  text;

alter table failed_material_disposition
  drop constraint if exists failed_material_disposition_completion_check;

alter table failed_material_disposition
  add constraint failed_material_disposition_completion_check
  check (completed_at is null
         or length(btrim(coalesce(completed_evidence,''))) >= 10);

comment on column failed_material_disposition.completed_at is
  'When the promised work actually happened - NOT when it was decided. Null means '
  'still owed. bought_for_remediation is a classification, not work, so it needs no '
  'completion.';
comment on column failed_material_disposition.completed_evidence is
  'What proves it happened: the Metrc adjustment, the retest package tag, the '
  'destruction record, the outbound manifest. Required whenever completed_at is set.';

create or replace view public.v_remediation_owed as
select
    d.package_tag,
    p.item_name,
    p.license,
    case when f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber') then 'OURS' else 'BOUGHT IN' end
                                                        as whose_material,
    d.disposition                                       as promised,
    d.decided_by,
    d.decided_at::date                                  as decided_on,
    current_date - d.decided_at::date                   as days_owed,
    case when f_is_weight(p.uom) then round(f_to_pounds(p.quantity, p.uom), 2) end
                                                        as pounds,
    p.lab_testing_state                                 as metrc_still_reads,
    p.location,
    d.reason,
    'THE ISSUE: a disposition was recorded but the work it promised has not been done. '
    'The package left the loss register and the flag board on the strength of an intention.'
                                                        as what_is_wrong,
    'Do the work, then set completed_at and completed_evidence on the disposition row. '
    'Until then this stays here.'                       as what_to_do
from failed_material_disposition d
join metrc_packages p on p.tag = d.package_tag
where d.superseded_at is null
  and d.completed_at is null
  and d.disposition in ('remediate_in_house','sell_for_remediation','destroy')
order by 9 desc nulls last;

comment on view public.v_remediation_owed is
  'Dispositions that promised work which has not been done. A decision recorded is '
  'not a decision implemented - this view is the guard for that rule on failed '
  'material. Empty is the good state. bought_for_remediation is excluded because it '
  'classifies material rather than committing to work.';;
