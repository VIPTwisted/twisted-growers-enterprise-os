-- Agent: M — identity_check produced a FALSE NEGATIVE on 12 Aug 2026: the sheet writes
-- "Pina Colada" and Metrc writes "Pina Colada" with an n-tilde, quantity agreed exactly at 12 ea,
-- and the check still called it a mismatch. Reporting that as a finding would have been the
-- fifth withdrawn finding of the week. Fold accents and punctuation before comparing.
-- Same column list, order and types - only the expression behind identity_check changes.

create or replace function f_strain_fold(v text) returns text
language sql immutable as $$
  select nullif(regexp_replace(
           lower(translate(coalesce(v,''),
             'áàâäãåéèêëíìîïóòôöõúùûüñçÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇ',
             'aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC')),
           '[^a-z0-9]', '', 'g'), '');
$$;
comment on function f_strain_fold(text) is
'Folds a strain or item name for comparison only: accents flattened, everything non-alphanumeric removed, lowercased. "Pina Colada" with an n-tilde and "Pina Colada" fold to the same string. NEVER use this for storage or display - the source spelling is the record.';

create or replace view v_finished_goods_metrc_reconciliation as
with fg as (
  select p.final_metrc_tag as tag,
         p.source_sheet, p.source_row, p.category, p.strain_flavor, p.production_batch,
         p.current_status, p.size_value, p.cases_available, p.coa_link, p.expiration_date,
         coalesce(p.total_packaged, p.total_units_packaged) as sheet_units,
         p.total_gram_equivalent as sheet_gram_equiv,
         p.bulk_metrc_tag, p.prefill_metrc_tag
  from product_inventory p
  where p.still_in_sheet and p.final_metrc_tag is not null
),
m as (
  select tag, sum(quantity) as metrc_qty, min(uom) as metrc_uom, count(*) as mirror_rows,
         string_agg(distinct license, ', ' order by license) as licences,
         bool_or(finished) as any_finished,
         string_agg(distinct item_name, ' | ') as metrc_item,
         max(lab_testing_state) as lab_testing_state
  from metrc_packages group by tag
),
tr as (
  select package_tag as tag, count(*) as transfer_lines,
         string_agg(distinct manifest_number::text, ', ') as manifests,
         max(received_on) as last_received_on,
         string_agg(distinct destination_facility, ', ') as destinations,
         string_agg(distinct item, ' | ') as manifest_item
  from metrc_rpt_package_transfers group by package_tag
)
select
  fg.tag, fg.source_sheet, fg.source_row, fg.category, fg.strain_flavor, fg.production_batch,
  fg.current_status, fg.cases_available, fg.coa_link, fg.expiration_date,
  fg.bulk_metrc_tag, fg.prefill_metrc_tag,
  fg.sheet_units, fg.size_value, fg.sheet_gram_equiv,
  m.metrc_qty, m.metrc_uom, m.licences, m.any_finished, m.metrc_item, m.lab_testing_state,
  tr.transfer_lines, tr.manifests, tr.last_received_on, tr.destinations, tr.manifest_item,
  case
    when m.tag is not null  then 'in_mirror'
    when tr.tag is not null then 'not_in_mirror_but_manifested'
    else 'not_in_mirror_and_no_manifest'
  end as existence,
  case
    when m.tag is null then null
    when m.metrc_uom = 'ea' and fg.sheet_units is not null and fg.sheet_units = m.metrc_qty then 'agree'
    when m.metrc_uom = 'g' and fg.sheet_units is not null and fg.size_value is not null
      and abs(fg.sheet_units * fg.size_value - m.metrc_qty) <= 0.01 then 'agree'
    when m.metrc_uom = 'g' and fg.sheet_gram_equiv is not null
      and abs(fg.sheet_gram_equiv - m.metrc_qty) <= 0.01 then 'agree'
    when m.metrc_uom = 'g' and fg.sheet_units is not null
      and abs(fg.sheet_units - m.metrc_qty) <= 0.01 then 'agree'
    when fg.sheet_units is null and fg.sheet_gram_equiv is null then 'no_sheet_quantity'
    else 'differs'
  end as quantity,
  case
    when m.metrc_uom = 'g' and fg.sheet_units is not null and fg.size_value is not null
      then fg.sheet_units * fg.size_value
    when m.metrc_uom = 'g' and fg.sheet_gram_equiv is not null then fg.sheet_gram_equiv
    else fg.sheet_units
  end as sheet_comparable,
  case
    when m.metrc_uom = 'g' and fg.sheet_units is not null and fg.size_value is not null then 'units x size (g)'
    when m.metrc_uom = 'g' and fg.sheet_gram_equiv is not null then 'total gram equivalent (g)'
    when m.metrc_uom = 'ea' then 'units (ea)'
    else 'units (basis unstated)'
  end as comparison_basis,
  case
    when m.tag is null and tr.tag is null then null
    when fg.strain_flavor is null then null
    when f_strain_fold(coalesce(m.metrc_item, tr.manifest_item))
         like '%'||f_strain_fold(fg.strain_flavor)||'%' then 'strain_matches'
    else 'STRAIN DOES NOT MATCH THE TAG'
  end as identity_check
from fg
left join m  on m.tag  = fg.tag
left join tr on tr.tag = fg.tag;;
