-- Agent: M — duplicate_key registered these natural keys but NOTHING ENFORCED THEM.
-- Without a unique index the upsert has no conflict target, so a second import of the same
-- file doubles the rows. A double-imported inventory sheet is a wrong inventory position.
-- Verified before creating: zero duplicate (source_sheet, source_row) pairs exist today.

create unique index if not exists product_inventory_natural_key
  on product_inventory (source_sheet, source_row);
comment on index product_inventory_natural_key is
'Enforces the natural key registered in duplicate_key. This is the idempotency key: re-importing the same tab upserts in place rather than doubling the rows.';

create unique index if not exists third_party_material_natural_key
  on third_party_material (metrc_tag, source_row);
comment on index third_party_material_natural_key is
'Enforces the natural key registered in duplicate_key. Tag can repeat across rows when material is split, so the sheet row disambiguates.';;
