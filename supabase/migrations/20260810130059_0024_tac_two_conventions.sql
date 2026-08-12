-- ---------------------------------------------------------------------------
-- 0024 — TAC computed two ways, because Metrc's feed does not carry it.
--
-- Owner, 10 Aug 2026: "TAC IS ON COA FOR FLOWER FOR SURE AND PREROLLS",
-- "THAT IS NUMBER ONE QUESTION FROM BUYERS THC AND TAC", "PULL FROM REAL COA".
--
-- VERIFIED ACROSS ALL ~280 DISTINCT TEST NAMES WE HOLD: there is NO TAC line in
-- the Metrc lab-results export -- no "TAC", no "Total Active Cannabinoids", no
-- "Total Cannabinoids". Metrc carries the state-required analytes only. The owner
-- is right that TAC is on the COA: it is on the LABORATORY PDF, which Metrc's
-- report feed does not reproduce. Until those PDFs are parsed, TAC must be
-- computed here.
--
-- TWO CONVENTIONS, both exposed, neither called "the" TAC:
--   tac_decarb  Total THC + Total CBD + CBG + CBN + CBC + THCV
--               Activated/"total" forms. Total THC already contains THCA x 0.877,
--               so acid forms are NOT added again.
--   tac_asis    THCA + THC + CBDA + CBD + CBGA + CBG + CBN + CBC + THCV + THCVA
--               Every cannabinoid as measured, acid forms at full weight. Reads
--               HIGHER, and is what many COA PDFs print as "Total Cannabinoids".
--
-- Guessing which one a buyer means would put a wrong number in front of a customer
-- on the question they ask most. Both are shown until the PDF confirms which.
--
-- Columns are APPENDED, never reordered -- CREATE OR REPLACE forbids renaming a
-- position, and the drop guard exists because dropping a view has blanked the
-- dashboards three times.
-- ---------------------------------------------------------------------------

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
       /* kept in position: the activated-form convention */
       round(coalesce(max(pct) filter (where analyte='TOTAL THC'),0)
           + coalesce(max(pct) filter (where analyte='TOTAL CBD'),0)
           + coalesce(max(pct) filter (where analyte='CBG'),0)
           + coalesce(max(pct) filter (where analyte='CBN'),0)
           + coalesce(max(pct) filter (where analyte='CBC'),0)
           + coalesce(max(pct) filter (where analyte='THCV'),0), 3)    as tac_computed,
       count(*)                                                  as analytes_reported,
       /* ---- appended ---- */
       max(pct) filter (where analyte = 'THC')                   as thc_delta9,
       max(pct) filter (where analyte = 'CBDA')                  as cbda,
       max(pct) filter (where analyte = 'CBD')                   as cbd,
       max(pct) filter (where analyte = 'CBGA')                  as cbga,
       round(coalesce(max(pct) filter (where analyte='TOTAL THC'),0)
           + coalesce(max(pct) filter (where analyte='TOTAL CBD'),0)
           + coalesce(max(pct) filter (where analyte='CBG'),0)
           + coalesce(max(pct) filter (where analyte='CBN'),0)
           + coalesce(max(pct) filter (where analyte='CBC'),0)
           + coalesce(max(pct) filter (where analyte='THCV'),0), 3)    as tac_decarb,
       round(coalesce(max(pct) filter (where analyte='THCA'),0)
           + coalesce(max(pct) filter (where analyte='THC'),0)
           + coalesce(max(pct) filter (where analyte='CBDA'),0)
           + coalesce(max(pct) filter (where analyte='CBD'),0)
           + coalesce(max(pct) filter (where analyte='CBGA'),0)
           + coalesce(max(pct) filter (where analyte='CBG'),0)
           + coalesce(max(pct) filter (where analyte='CBN'),0)
           + coalesce(max(pct) filter (where analyte='CBC'),0)
           + coalesce(max(pct) filter (where analyte='THCV'),0)
           + coalesce(max(pct) filter (where analyte='THCVA'),0), 3)   as tac_asis,
       'COMPUTED — Metrc carries no TAC line. Confirm against the laboratory PDF which convention it prints.'::text as tac_note
from a
group by 1,2,3,4,5,6,7,8,9,10;

comment on view v_potency_tac is
  'THC and TAC per package -- the two figures buyers ask for first. TAC is COMPUTED '
  'both ways because Metrc''s export carries NO TAC line (verified across all ~280 '
  'test names): tac_decarb uses activated totals; tac_asis sums every cannabinoid '
  'with acid forms at full weight and reads higher. Neither is "the" TAC until the '
  'laboratory PDF confirms which it prints. Never present either as lab-reported.';

grant select on v_potency_tac to authenticated;
;
