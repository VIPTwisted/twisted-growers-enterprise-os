create or replace view v_finished_goods_onhand as
select
  p.category,
  p.source_sheet                                        as product_line,
  p.current_status,
  p.strain_flavor,
  p.product_description,
  p.infusion_type,
  p.size_g                                              as size_as_written,
  p.size_value, p.size_unit,
  p.production_batch,

  -- the Metrc tag chain, all three, never collapsed
  p.bulk_metrc_tag,
  p.prefill_metrc_tag,
  p.final_metrc_tag,
  p.final_tag_note,
  p.business_key, p.business_key_basis,

  -- what the sales team is actually selling
  p.cases_available,
  p.case_size,
  coalesce(p.total_packaged, p.total_units_packaged)    as units_packaged,
  p.total_filled, p.total_units_filled, p.total_units,
  p.total_bulk, p.total_gram_equivalent,

  -- potency. THC and THCA are different analytes and are NOT pooled.
  p.tac_pct, p.thc_pct, p.thca_pct, p.cannabinoid_reported,
  p.terpene_pct, p.terpene_status,

  -- shelf life. The sheet's own arithmetic is kept AND recomputed, so a stale
  -- spreadsheet formula cannot quietly become the platform's answer.
  p.creation_date,
  p.expiration_date,
  p.days_to_expiration                                  as days_to_expiry_per_sheet,
  (p.expiration_date - current_date)                    as days_to_expiry_recomputed,
  case
    when p.expiration_date is null                      then 'no expiry date in the sheet'
    when p.expiration_date <  current_date              then 'EXPIRED'
    when p.expiration_date <= current_date + 30         then 'expires within 30 days'
    when p.expiration_date <= current_date + 90         then 'expires within 90 days'
    else 'in date'
  end                                                   as expiry_bucket,
  p.expiry_flag                                         as expiry_flag_per_sheet,

  -- reorder
  p.threshold_units,
  p.low_stock_flag                                      as low_stock_flag_per_sheet,
  case
    when p.threshold_units is null then null
    when coalesce(p.total_packaged, p.total_units_packaged, 0) < p.threshold_units then true
    else false
  end                                                   as low_stock_recomputed,

  -- certificate
  p.coa_link,
  (p.coa_link is not null)                              as has_coa_link,

  -- physical check
  p.inventory_check, p.location, p.notes,

  -- does Metrc agree? Never hidden from the people selling it.
  r.existence                                           as metrc_existence,
  r.quantity                                            as metrc_quantity_check,
  r.identity_check                                      as metrc_identity_check,
  r.metrc_qty, r.metrc_uom, r.comparison_basis, r.sheet_comparable,
  case
    when p.final_metrc_tag is null                              then 'no final tag to check'
    when r.identity_check = 'STRAIN DOES NOT MATCH THE TAG'     then 'DO NOT SELL WITHOUT CHECKING - the tag on this row belongs to a different product in Metrc'
    when r.existence = 'not_in_mirror_and_no_manifest'          then 'tag not yet in our Metrc mirror'
    when r.quantity = 'differs'                                 then 'quantity disagrees with Metrc'
    when r.quantity = 'agree'                                   then 'agrees with Metrc'
    else 'not checked'
  end                                                   as sales_confidence,

  -- provenance: every figure on this row is only as fresh as the sheet read
  p.source_sheet, p.source_row, p.sheet_key, p.source_file_id,
  p.as_of                                               as sheet_as_of,
  p.sheet_modified_at, p.synced_at, p.import_run_id
from product_inventory p
left join v_finished_goods_metrc_reconciliation r on r.tag = p.final_metrc_tag
where p.still_in_sheet;

comment on view v_finished_goods_onhand is
'FINISHED GOODS ON HAND FOR THE SALES TEAM, mirrored read-only from the owner''s Manufacturing Product Inventory workbook. Owner: "THIS IS INVENTORY ON HAND FINISHED GOODS THIS MUST MUST MUST BE ON OUR COMMAND CENTER FOR COO AND CEO AS THEY ARE VERY INVOLVED IN SALES." Every row carries the FULL Metrc tag chain - bulk, pre-fill holding and final product - so any row drills to its tag per the house drilldown rule. still_in_sheet is enforced here: a row the sheet has since removed never appears as sellable. sales_confidence surfaces the Metrc reconciliation on the row itself rather than burying it in a report, because 12 of 65 final tags currently name a different product in Metrc than the sheet claims. Days to expiry and the low-stock flag are shown BOTH as the sheet computed them and as recomputed here - if the two disagree the sheet formula is stale, and that is a finding, not something to average.';;
