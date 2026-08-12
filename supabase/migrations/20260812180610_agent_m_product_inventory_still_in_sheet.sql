-- Agent: M — a mirror must be able to say "the source no longer has this row".
-- The 9 Aug 2026 load left rows behind that the sheet has since removed. Deleting them would
-- destroy history; leaving them unmarked would sell stock that is not there. Neither. Mark them.

alter table product_inventory
  add column if not exists still_in_sheet boolean not null default true,
  add column if not exists withdrawn_at   timestamptz,
  add column if not exists withdrawn_note text;

comment on column product_inventory.still_in_sheet is
'FALSE when the row was present in an earlier read of this tab and is absent from the latest one. The row is kept for history and MUST be excluded from any on-hand surface. Never delete a mirror row - the sheet removing a line is itself a fact worth keeping.';;
