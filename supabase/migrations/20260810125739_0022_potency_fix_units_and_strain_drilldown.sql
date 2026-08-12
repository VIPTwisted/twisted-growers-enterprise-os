-- ---------------------------------------------------------------------------
-- 0022 — Fix a unit-mixing defect, and add the strain drill-down.
--
-- THE DEFECT, caught before anyone used it. v_potency_results filtered on
-- test_name ILIKE '%Total THC%', which matches BOTH
--   "Total THC (%) Raw Plant Material"        -> per cent
--   "Total THC (mg/g) R&D Testing (Infused)"  -> milligrams per gram
-- and averaged them together. Bulk Flower reported a maximum of 259.37 and
-- Concentrates 798.75. Read as per cent those are impossible, and the instinct is
-- to call the lab data corrupt. It is not -- 798.75 mg/g IS 79.9%, a normal
-- concentrate. The defect was mine: the classic unit_mismatch.
--
-- % = mg/g / 10. The unit is now READ FROM THE TEST NAME and normalised. pct KEEPS
-- ITS POSITION and becomes the normalised figure; raw_value and raw_unit are
-- APPENDED so nothing downstream breaks and the conversion is never silent.
--
-- CREATE OR REPLACE, not DROP. The drop guard refused the first attempt and it was
-- right to -- dropping a view cascades and has blanked the dashboards three times.
-- Replacing in place means column order must be preserved and new columns appended.
-- ---------------------------------------------------------------------------

create or replace view v_potency_results as
select r.package_tag,
       r.item,
       f_strain_from_item(r.item)                              as strain,
       f_product_line(r.item, r.category, r.test_name)          as product_line,
       r.category                                               as metrc_category,
       r.packaged_licence                                       as licence,
       r.lab_facility                                           as lab,
       r.test_date,
       extract(year  from r.test_date)::int                     as yr,
       to_char(r.test_date, 'YYYY-MM')                          as month,
       extract(quarter from r.test_date)::int                   as quarter,
       r.test_name,
       /* NORMALISED, and in the same position it always held. */
       case when r.test_name ilike '%mg/g%' then round((r.result / 10.0)::numeric, 3)
            else round(r.result::numeric, 3) end                as pct,
       r.overall_passed,
       r.source_harvests,
       t.target_min,
       t.status                                                 as target_status,
       t.set_by                                                 as target_set_by,
       case when t.target_min is null then null
            else ((case when r.test_name ilike '%mg/g%' then r.result/10.0 else r.result end)
                  >= t.target_min) end                          as hits_target,
       case when t.target_min is null then 'no target set'
            when (case when r.test_name ilike '%mg/g%' then r.result/10.0 else r.result end)
                 >= t.target_min then 'at or above target'
            else 'below target' end                             as target_verdict,
       /* appended, so the conversion can always be audited */
       r.result                                                 as raw_value,
       case when r.test_name ilike '%mg/g%' then 'mg/g' else '%' end as raw_unit
from metrc_rpt_lab_results r
left join potency_target t
       on t.category = f_product_line(r.item, r.category, r.test_name)
      and t.analyte  = 'Total THC'
/* OURS ONLY -- the owner's rule. Bought-in material is somebody else's grow. */
where f_is_ours(r.packaged_licence)
  and r.test_name ilike '%Total THC%'
  and r.result is not null;

comment on view v_potency_results is
  'One row per Total THC result on OUR OWN material. pct is NORMALISED -- the unit '
  'is read from the test name and mg/g divided by 10, because Metrc reports both '
  'under names beginning "Total THC" and averaging them produced an apparent '
  '798.75% concentrate. raw_value and raw_unit are kept so the conversion is never '
  'silent. Filter by strain, product_line, lab, licence, yr, month, quarter, test_date.';


-- STRAIN DRILL-DOWN, with consistency alongside the average.
create or replace view v_potency_by_strain as
select strain,
       product_line,
       yr,
       count(*)                                           as tests,
       count(distinct package_tag)                        as tags,
       count(distinct month)                              as months_tested,
       round(avg(pct),2)                                  as mean_pct,
       round(percentile_cont(0.5) within group (order by pct)::numeric,2) as median_pct,
       round(min(pct),2)                                  as min_pct,
       round(max(pct),2)                                  as max_pct,
       round(stddev_samp(pct),2)                          as consistency_sd,
       max(target_min)                                    as target_min,
       count(*) filter (where hits_target)                as at_or_above_target,
       case when max(target_min) is null then null
            else round(100.0*count(*) filter (where hits_target)/count(*),1) end as pct_hitting_target,
       min(test_date)                                     as first_tested,
       max(test_date)                                     as last_tested
from v_potency_results
where strain is not null
group by 1,2,3;

comment on view v_potency_by_strain is
  'Potency by STRAIN and year, with consistency (standard deviation) beside the '
  'average -- a strain that averages the target while swinging ten points is a '
  'different problem from one sitting just under it every time. Ours only.';

grant select on v_potency_results, v_potency_by_strain to authenticated;
;
