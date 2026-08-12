-- ---------------------------------------------------------------------------
-- 0023 — Every potency analyte, plus a computed TAC.
--
-- Owner, 10 Aug 2026: "DO FOR BOTH THC AND TAC IF AVAILABLE" / "WHATEVER MEASURES
-- POTENCY".
--
-- NO LAB REPORTS TAC. Checked across every test name we hold: the panels carry
-- Total THC, THC, THCA, Total CBD, CBD, CBDA, CBG, CBGA, CBN, CBC, CBCA, THCV,
-- THCVA and Other Terpenes -- but no "Total Active Cannabinoids" line. So TAC is
-- COMPUTED here and labelled as computed, never presented as a lab figure.
--
-- THE FORMULA, and why it is not simply "add everything up":
--   TAC = Total THC + Total CBD + CBG + CBN + CBC + THCV
-- Total THC ALREADY contains THCA (as THCA x 0.877 + THC) and Total CBD already
-- contains CBDA. Adding THCA and CBDA again would double-count the two largest
-- components and inflate TAC by roughly 80%. The acid forms are therefore
-- deliberately excluded.
--
-- Units are normalised the same way as 0022: % = mg/g / 10, read from the test
-- name. Mixing them produced an apparent 798.75% concentrate.
-- ---------------------------------------------------------------------------

create or replace view v_potency_analytes as
select r.package_tag,
       r.item,
       f_strain_from_item(r.item)                              as strain,
       f_product_line(r.item, r.category, r.test_name)          as product_line,
       r.packaged_licence                                       as licence,
       r.lab_facility                                           as lab,
       r.test_date,
       extract(year from r.test_date)::int                      as yr,
       to_char(r.test_date,'YYYY-MM')                           as month,
       extract(quarter from r.test_date)::int                   as quarter,
       r.test_name,
       /* Analyte name with the unit and matrix stripped: "Total THC (%) Raw Plant
          Material" -> "Total THC". THCa is upper-cased to THCA so one strain does
          not appear as two analytes. */
       upper(regexp_replace(r.test_name, '\s*\((%|mg/g|ppm|ppb|CFU/g|AW)\).*$',''))  as analyte,
       case when r.test_name ilike '%mg/g%' then 'mg/g' else '%' end as raw_unit,
       r.result                                                 as raw_value,
       case when r.test_name ilike '%mg/g%' then round((r.result/10.0)::numeric,3)
            else round(r.result::numeric,3) end                 as pct,
       r.overall_passed,
       r.source_harvests
from metrc_rpt_lab_results r
where f_is_ours(r.packaged_licence)          -- OURS ONLY, owner's rule
  and r.result is not null
  and r.test_name ~* '^(Total THC|Total CBD|THCA|THCa|THCV|THCVA|CBD|CBDA|CBDV|CBG|CBGA|CBN|CBC|CBCA|THC)\s*\(';

comment on view v_potency_analytes is
  'Every cannabinoid result on OUR material, one row per analyte per test, units '
  'normalised to per cent. Filter by strain, product_line, analyte, lab, yr, month.';


create or replace view v_potency_tac as
with a as (
  select package_tag, item, strain, product_line, licence, lab,
         test_date, yr, month, quarter, analyte, pct
  from v_potency_analytes
)
select package_tag, item, strain, product_line, licence, lab, test_date, yr, month, quarter,
       max(pct) filter (where analyte = 'TOTAL THC')            as total_thc,
       max(pct) filter (where analyte = 'TOTAL CBD')            as total_cbd,
       max(pct) filter (where analyte = 'THCA')                 as thca,
       max(pct) filter (where analyte = 'CBG')                  as cbg,
       max(pct) filter (where analyte = 'CBN')                  as cbn,
       max(pct) filter (where analyte = 'CBC')                  as cbc,
       max(pct) filter (where analyte = 'THCV')                 as thcv,
       /* COMPUTED, NOT REPORTED. Acid forms excluded -- Total THC already contains
          THCA and Total CBD already contains CBDA, so adding them again would
          double-count the two largest components. */
       round(coalesce(max(pct) filter (where analyte='TOTAL THC'),0)
           + coalesce(max(pct) filter (where analyte='TOTAL CBD'),0)
           + coalesce(max(pct) filter (where analyte='CBG'),0)
           + coalesce(max(pct) filter (where analyte='CBN'),0)
           + coalesce(max(pct) filter (where analyte='CBC'),0)
           + coalesce(max(pct) filter (where analyte='THCV'),0), 3)  as tac_computed,
       count(*)                                                  as analytes_reported
from a
group by 1,2,3,4,5,6,7,8,9,10;

comment on view v_potency_tac is
  'Total Active Cannabinoids, COMPUTED -- no lab in our data reports a TAC line. '
  'TAC = Total THC + Total CBD + CBG + CBN + CBC + THCV. Acid forms are EXCLUDED '
  'because Total THC already contains THCA and Total CBD already contains CBDA; '
  'including them again would double-count the two largest components and inflate '
  'TAC by roughly 80%. Never present tac_computed as a laboratory figure.';


-- Strain drill-down across ANY analyte, including computed TAC.
create or replace view v_potency_by_strain_analyte as
select strain, product_line, analyte, yr,
       count(*)                                                  as tests,
       count(distinct package_tag)                               as tags,
       round(avg(pct),2)                                         as mean_pct,
       round(percentile_cont(0.5) within group (order by pct)::numeric,2) as median_pct,
       round(min(pct),2)                                         as min_pct,
       round(max(pct),2)                                         as max_pct,
       round(stddev_samp(pct),2)                                 as consistency_sd,
       min(test_date)                                            as first_tested,
       max(test_date)                                            as last_tested
from v_potency_analytes
where strain is not null
group by 1,2,3,4
union all
select strain, product_line, 'TAC (computed)', yr,
       count(*), count(distinct package_tag),
       round(avg(tac_computed),2),
       round(percentile_cont(0.5) within group (order by tac_computed)::numeric,2),
       round(min(tac_computed),2), round(max(tac_computed),2),
       round(stddev_samp(tac_computed),2),
       min(test_date), max(test_date)
from v_potency_tac
where strain is not null and tac_computed > 0
group by 1,2,4;

comment on view v_potency_by_strain_analyte is
  'Potency by strain, product line, ANALYTE and year -- including computed TAC. '
  'Standard deviation sits beside the average because a strain that averages the '
  'target while swinging ten points is a different problem from one that sits just '
  'under it every time.';

grant select on v_potency_analytes, v_potency_tac, v_potency_by_strain_analyte to authenticated;
;
