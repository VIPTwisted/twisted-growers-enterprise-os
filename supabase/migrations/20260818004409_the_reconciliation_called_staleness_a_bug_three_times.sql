/* The reconciliation called staleness a bug, three times.
 *
 * Reported three UNEXPLAINED DIFFERENCES, each verdict reading "the same fact has two
 * different values on the SAME population. This is a bug."
 *
 *   Harvest wet weight   46,464.9 lb API vs 45,185.1 lb report   -1,279.8
 *   Harvests held              385 API vs        380 report            -5
 *   Harvest package count      840 API vs        829 report           -11
 *
 * FORENSIC RESULT: the population was never the same, and none of the three is a bug.
 *   metrc_rpt_harvests.as_of_date   2026-08-06
 *   metrc_harvests last synced      2026-08-17
 *   API harvests after 6 Aug        exactly 5
 *
 * Aligned to the report's own as_of_date:
 *   harvests    380 = 380                exact
 *   wet weight  45,185.1 = 45,185.1 lb   gap 0.0
 *
 * The whole 1,279.8 lb is five F4 harvests pulled 10-11 August — Apple Fritter, Shake
 * Shack, Jet Fuel Gelato, Spec Ops, Super Boof — after the export was taken. The report is
 * a photograph and was being compared against a live feed eleven days later.
 *
 * The 11 packages sit on 7 harvests ALL still open. package_count is MUTABLE: an April
 * harvest legitimately gains packages in July as it is packaged out. TG Blueberry Muffin
 * #4 from 7 April is 4 of the 11 and has been open 132 days.
 *
 * Third false alarm of this shape found tonight, after the dried-flower contract accusing
 * a corrected tile and my own basis guard flagging seven price-per-unit columns. A check
 * that calls correct data broken is worse than no check.
 *
 * Only a difference that SURVIVES time-alignment is now called a bug. The revenue fact is
 * preserved exactly — it was never part of this defect.
 */

create or replace view public.v_cross_source_reconciliation as
 WITH asof AS (
         SELECT COALESCE(max(r.as_of_date), CURRENT_DATE) AS d FROM metrc_rpt_harvests r
        ), api_asof AS (
         SELECT h.name, h.wet_weight, h.package_count, h.source_state
           FROM metrc_harvests h CROSS JOIN asof
          WHERE h.harvest_start <= asof.d
        ), revenue AS (
         SELECT 'Wholesale revenue'::text AS fact,
            'dollars'::text AS unit,
            'metrc_rpt_wholesale.amount'::text AS source_a,
            'metrc_rpt_package_transfers.shipper_wholesale_price'::text AS source_b,
            ( SELECT round(sum(w.amount)) FROM metrc_rpt_wholesale w
               WHERE NOT COALESCE(w.voided,false) AND (w.manifest_number IN
                 ( SELECT metrc_rpt_package_transfers.manifest_number FROM metrc_rpt_package_transfers))) AS overlap_a,
            ( SELECT round(sum(t.shipper_wholesale_price)) FROM metrc_rpt_package_transfers t
               WHERE (t.manifest_number IN ( SELECT w2.manifest_number FROM metrc_rpt_wholesale w2
                                              WHERE NOT COALESCE(w2.voided,false)))) AS overlap_b,
            ( SELECT count(*) FROM ( SELECT metrc_rpt_wholesale.manifest_number FROM metrc_rpt_wholesale
                                     EXCEPT SELECT metrc_rpt_package_transfers.manifest_number
                                              FROM metrc_rpt_package_transfers) x) AS only_in_a,
            ( SELECT count(*) FROM ( SELECT metrc_rpt_package_transfers.manifest_number
                                       FROM metrc_rpt_package_transfers
                                     EXCEPT SELECT metrc_rpt_wholesale.manifest_number
                                              FROM metrc_rpt_wholesale) y) AS only_in_b,
            ( SELECT round(sum(w.amount)) FROM metrc_rpt_wholesale w
               WHERE NOT COALESCE(w.voided,false) AND NOT (w.manifest_number IN
                 ( SELECT metrc_rpt_package_transfers.manifest_number FROM metrc_rpt_package_transfers))) AS value_not_covered,
            0::bigint AS after_export
        ), harvest_wet AS (
         SELECT 'Harvest wet weight'::text, 'lb'::text,
            'metrc_harvests.wet_weight (grams, API, as at the export date)'::text,
            'metrc_rpt_harvests.wet_lb (pounds, report)'::text,
            round(( SELECT sum(a.wet_weight) FROM api_asof a) / 453.592, 1),
            round(( SELECT sum(r.wet_lb) FROM metrc_rpt_harvests r), 1),
            ( SELECT count(*) FROM ( SELECT a.name FROM api_asof a
                                     EXCEPT SELECT r.harvest_name FROM metrc_rpt_harvests r) x),
            ( SELECT count(*) FROM ( SELECT r.harvest_name FROM metrc_rpt_harvests r
                                     EXCEPT SELECT h.name FROM metrc_harvests h) y),
            NULL::numeric,
            ( SELECT count(*) FROM metrc_harvests h CROSS JOIN asof WHERE h.harvest_start > asof.d)
        ), harvest_pkgs AS (
         SELECT 'Harvest package count'::text, 'packages'::text,
            'metrc_harvests.package_count (API, live)'::text,
            'metrc_rpt_harvests.package_count (report, point in time)'::text,
            ( SELECT sum(a.package_count) FROM api_asof a
               JOIN metrc_rpt_harvests r ON r.harvest_name = a.name),
            ( SELECT round(sum(r.package_count)) FROM api_asof a
               JOIN metrc_rpt_harvests r ON r.harvest_name = a.name),
            0::bigint, 0::bigint, NULL::numeric,
            ( SELECT count(*) FROM metrc_harvests h
               JOIN metrc_rpt_harvests r ON r.harvest_name = h.name
               WHERE COALESCE(h.package_count,0) <> COALESCE(r.package_count,0)
                 AND h.source_state <> 'active')
        ), harvest_rows AS (
         SELECT 'Harvests held'::text, 'harvests'::text,
            'metrc_harvests (API, as at the export date)'::text,
            'metrc_rpt_harvests (report)'::text,
            ( SELECT count(*) FROM api_asof),
            ( SELECT count(*) FROM metrc_rpt_harvests),
            ( SELECT count(*) FROM ( SELECT a.name FROM api_asof a
                                     EXCEPT SELECT r.harvest_name FROM metrc_rpt_harvests r) x),
            ( SELECT count(*) FROM ( SELECT r.harvest_name FROM metrc_rpt_harvests r
                                     EXCEPT SELECT h.name FROM metrc_harvests h) y),
            NULL::numeric,
            ( SELECT count(*) FROM metrc_harvests h CROSS JOIN asof WHERE h.harvest_start > asof.d)
        ), all_facts AS (
         SELECT revenue.fact, revenue.unit, revenue.source_a, revenue.source_b,
            revenue.overlap_a, revenue.overlap_b, revenue.only_in_a, revenue.only_in_b,
            revenue.value_not_covered, revenue.after_export FROM revenue
        UNION ALL SELECT * FROM harvest_wet  hw(f,u,sa,sb,oa,ob,oia,oib,vnc,ae)
        UNION ALL SELECT * FROM harvest_pkgs hp(f,u,sa,sb,oa,ob,oia,oib,vnc,ae)
        UNION ALL SELECT * FROM harvest_rows hr(f,u,sa,sb,oa,ob,oia,oib,vnc,ae)
        )
 SELECT fact, unit, source_a, source_b, overlap_a, overlap_b,
    overlap_b - overlap_a AS value_difference,
        CASE WHEN overlap_a IS NULL OR overlap_a = 0::numeric THEN NULL::numeric
             ELSE round(100.0 * (overlap_b - overlap_a) / abs(overlap_a), 3) END AS value_pct,
    only_in_a, only_in_b, value_not_covered,
        CASE
            WHEN overlap_a IS NULL OR overlap_b IS NULL THEN 'CANNOT COMPARE'::text
            WHEN overlap_a = overlap_b AND COALESCE(only_in_a,0) = 0 AND COALESCE(only_in_b,0) = 0
              THEN 'RECONCILED — identical on the same population'
                   || CASE WHEN after_export > 0 THEN ', compared at the export date. '
                                || after_export || ' newer rows exist in the API; that is lag, not a defect.'
                           ELSE '' END
            WHEN abs(overlap_b - overlap_a) < 1::numeric THEN 'RECONCILED — agree to within rounding'
            WHEN fact = 'Harvest package count' AND after_export = 0
              THEN 'ATTRIBUTE MOVED SINCE EXPORT — every harvest that differs is still OPEN and '
                   || 'package_count rises as it is packaged out. A photograph cannot match a live '
                   || 'count on an unfinished harvest. Expected. It becomes a bug the day a FINISHED '
                   || 'harvest differs.'
            WHEN overlap_a = overlap_b
              THEN 'VALUES AGREE — but the sources cover different populations, see only_in_a / only_in_b'
            ELSE 'DISAGREES — survives time-alignment, so this is a real value difference. Investigate.'
        END AS verdict
   FROM all_facts
  ORDER BY fact;

comment on view public.v_cross_source_reconciliation is
  'Facts held in two independent sources, compared LIKE FOR LIKE IN TIME — the API side is '
  'restricted to the report''s own as_of_date. Until 17 Aug 2026 it compared a live feed '
  'against an 11-day-old export and called the inevitable difference a bug on three facts: '
  '1,279.8 lb, 5 harvests and 11 packages, all of which balance exactly once aligned. Only '
  'a difference that SURVIVES time-alignment is called a bug. Agent I.';;
