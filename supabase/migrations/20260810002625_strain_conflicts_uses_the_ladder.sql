-- ROOT CAUSE FIX, 9/10 Aug 2026.
--
-- I resolved 904 strain discrepancies through the naming ladder and tg_sweep_discrepancies
-- reopened every one of them within hours. The sweep was RIGHT to: it reopens anything still
-- detected, which is rule H1 working. The fault was that I fixed the rows instead of the
-- DETECTOR, so the detector kept detecting.
--
-- v_strain_conflicts compared the strain parsed out of the ITEM NAME against the Metrc STRAIN
-- FIELD. Under owner ruling D4 that comparison is a category error: an item name is a PRODUCT
-- name, and a package built from several harvests is a BLEND with no single strain at all.
-- 805 of its 956 rows were not conflicts.
--
-- It now consults f_strain_by_tag and keeps only rows where seed-to-sale says there is a real
-- disagreement. Columns are APPENDED, never reordered or removed (E1).

create or replace view v_strain_conflicts as
with candidate as (
  select t.manifest_number, t.package_tag, t.item,
         t.strain as strain_column_says,
         f_strain_from_item(t.item) as item_name_says,
         t.destination_facility, t.shipped_qty,
         t.shipper_wholesale_price as value_usd
  from metrc_rpt_package_transfers t
  where t.strain is not null and t.strain <> ''
    and f_strain_from_item(t.item) is not null
    and lower(replace(t.strain,'.','')) <> lower(replace(f_strain_from_item(t.item),'.',''))
    and lower(t.strain) not like '%'||lower(f_strain_from_item(t.item))||'%'
    and lower(f_strain_from_item(t.item)) not like '%'||lower(t.strain)||'%'
),
judged as (
  select c.*, l.strain as ladder_strain, l.verdict as ladder_verdict,
         l.decided_by_rung, l.evidence as ladder_evidence
  from candidate c
  cross join lateral f_strain_by_tag(c.package_tag) l
)
select j.manifest_number,
       j.package_tag,
       j.item,
       j.strain_column_says,
       j.item_name_says,
       j.destination_facility,
       j.shipped_qty,
       j.value_usd,
       case
         when j.ladder_strain is not null
              and lower(j.ladder_strain) = lower(btrim(j.item_name_says))
           then 'Metrc seed-to-sale says "'||j.ladder_strain||'", which matches the ITEM NAME. '
                ||'The Metrc STRAIN FIELD is the wrong one and must be corrected at source (D2).'
         else 'Neither the item name nor the strain field is supported by seed-to-sale. '
              ||'No certificate and no manifest settles it either. This one needs a person (A5).'
       end as what_is_wrong,
       -- appended by the D4 ruling, 9 Aug 2026
       j.ladder_verdict,
       j.ladder_strain,
       j.decided_by_rung,
       j.ladder_evidence
from judged j
-- KEEP only genuine conflicts. Excluded by construction:
--   BLEND            - built from several harvests, so Metrc's single strain field cannot
--                      describe it and neither name is wrong.
--   strain confirmed - seed-to-sale agrees with the strain field, so the item name is simply
--                      a product name.
where not (j.ladder_verdict like 'BLEND%')
  and not (j.ladder_strain is not null
           and lower(j.ladder_strain) = lower(btrim(j.strain_column_says)));

comment on view v_strain_conflicts is
  'Strain disagreements that survive the naming ladder (owner ruling D4, 9 Aug 2026). Blends '
  'and product names are excluded BY CONSTRUCTION, not filtered downstream - resolving them in '
  'discrepancy_register did not work because tg_sweep_discrepancies correctly reopens anything '
  'still detected. Fix the detector, not the rows.';;
