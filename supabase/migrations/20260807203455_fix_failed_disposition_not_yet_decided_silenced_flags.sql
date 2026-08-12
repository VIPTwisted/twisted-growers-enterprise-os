-- DEFECT: v_item_flags_all and v_real_loss both silence a failed package with
--   NOT EXISTS (select 1 from failed_material_disposition where package_tag = tag
--               and superseded_at is null)
-- ANY non-superseded row clears the flag - including disposition = 'not_yet_decided'.
-- Writing "not yet decided" therefore made the open decision DISAPPEAR from the board.
-- That is THE META-TRAP: a decision recorded is not a decision implemented.
--
-- FIX: 'not yet decided' is not a disposition, it is the ABSENCE of one, and both
-- views already read "no row" as "still open". Removing the value makes the bug
-- structurally impossible instead of patching two views (and any third built later
-- inherits the correct behaviour for free).
--
-- Safe: 0 rows in the table, 0 functions and 0 views reference the literal.
-- UNDO: re-add 'not_yet_decided'::text to the array below.

alter table failed_material_disposition
  drop constraint failed_material_disposition_disposition_check;

alter table failed_material_disposition
  add constraint failed_material_disposition_disposition_check
  check (disposition = any (array[
    'bought_for_remediation'::text,
    'remediate_in_house'::text,
    'sell_for_remediation'::text,
    'destroy'::text]));

comment on table failed_material_disposition is
  'Per-package ruling on failed material. Append-only. A row here means a decision '
  'was MADE - it silences the failed-testing flag in v_item_flags_all and removes '
  'the package from v_real_loss. There is deliberately NO "not_yet_decided" value: '
  'that state is represented by the ABSENCE of a row, so an undecided package keeps '
  'showing on the board. Only disposition = ''destroy'' counts as a loss.';;
