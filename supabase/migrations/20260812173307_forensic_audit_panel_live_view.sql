-- Agent W. The forensic audit panel's computation, lifted verbatim out of
-- v_forensic_audit_panel so it lives in exactly ONE place.
--
-- Why a separate _live view rather than pasting the SQL into the matview:
-- the matview is built FROM this view, so the definition can never drift from
-- the thing that verifies it. It also leaves a live-recompute path so the
-- matview can be diffed against a fresh computation on demand -- which is the
-- only way to prove a cached figure is still the right figure.
--
-- SQL is byte-for-byte pg_get_viewdef('v_forensic_audit_panel') as of 12 Aug 2026.
create or replace view v_forensic_audit_panel_live as
 WITH prod AS (
         SELECT COALESCE(sum(f_to_pounds(COALESCE((metrc_packages.raw ->> 'CreatedQuantity'::text)::numeric, 0::numeric), COALESCE(NULLIF(metrc_packages.raw ->> 'UnitOfMeasureName'::text, ''::text), 'Grams'::text))), 0::numeric) AS lb
           FROM metrc_packages
          WHERE NULLIF(metrc_packages.raw ->> 'SourceHarvestNames'::text, ''::text) IS NOT NULL AND NULLIF(metrc_packages.raw ->> 'SourcePackageLabels'::text, ''::text) IS NULL AND f_is_weight(COALESCE(NULLIF(metrc_packages.raw ->> 'UnitOfMeasureName'::text, ''::text), 'Grams'::text))
        ), xf AS (
         SELECT COALESCE(sum(v_transfer_line.pounds) FILTER (WHERE v_transfer_line.direction = 'INBOUND'::text), 0::numeric) AS in_lb,
            COALESCE(sum(v_transfer_line.pounds) FILTER (WHERE v_transfer_line.direction = 'OUTBOUND'::text), 0::numeric) AS out_lb,
            COALESCE(sum(v_transfer_line.pounds) FILTER (WHERE v_transfer_line.direction = 'INTERNAL'::text), 0::numeric) AS internal_lb
           FROM v_transfer_line
          WHERE v_transfer_line.voided <> 'True'::text
        ), adj AS (
         SELECT COALESCE(sum(f_to_pounds(metrc_rpt_adjustments.quantity, metrc_rpt_adjustments.uom)), 0::numeric) AS lb
           FROM metrc_rpt_adjustments
          WHERE metrc_rpt_adjustments.quantity IS NOT NULL AND f_is_weight(metrc_rpt_adjustments.uom)
        ), oh AS (
         SELECT COALESCE(sum(f_to_pounds(COALESCE((metrc_packages.raw ->> 'Quantity'::text)::numeric, 0::numeric), COALESCE(NULLIF(metrc_packages.raw ->> 'UnitOfMeasureName'::text, ''::text), 'Grams'::text))), 0::numeric) AS lb
           FROM metrc_packages
          WHERE NOT COALESCE((metrc_packages.raw ->> 'IsFinished'::text)::boolean, false) AND f_is_weight(COALESCE(NULLIF(metrc_packages.raw ->> 'UnitOfMeasureName'::text, ''::text), 'Grams'::text))
        ), tp AS (
         SELECT COALESCE(sum(v_third_party_forensic.lb_on_hand), 0::numeric) AS on_hand,
            COALESCE(sum(v_third_party_forensic.lb_received) FILTER (WHERE v_third_party_forensic.status ~~ 'UNEXPLAINED%'::text), 0::numeric) AS unexplained,
            COALESCE(sum(v_third_party_forensic.lb_received) FILTER (WHERE v_third_party_forensic.lab_failures > 0), 0::numeric) AS failed,
            COALESCE(sum(COALESCE(v_third_party_forensic.exit_lb, 0::numeric) + COALESCE(v_third_party_forensic.lb_sold, 0::numeric)), 0::numeric) AS resold,
            COALESCE(sum(v_third_party_forensic.exit_sold_usd), 0::numeric) AS resold_usd,
            count(*) FILTER (WHERE v_third_party_forensic.status ~~ 'UNEXPLAINED%'::text) AS unexplained_tags
           FROM v_third_party_forensic
        ), spend AS (
         SELECT COALESCE(sum(NULLIF(t.source_row ->> 'Receiver Wholesale Price'::text, ''::text)::numeric), 0::numeric) AS usd
           FROM metrc_rpt_package_transfers t
          WHERE f_is_ours(COALESCE(NULLIF(t.source_row ->> 'Dest. Lic.'::text, ''::text), t.destination_licence)) AND NOT f_is_ours(COALESCE(NULLIF(t.source_row ->> 'Origin Lic.'::text, ''::text), t.licence)) AND COALESCE(t.source_row ->> 'Voided'::text, 'False'::text) <> 'True'::text
        ), noinv AS (
         SELECT count(*) AS n,
            COALESCE(sum(v_forensic_sold_by_tag.pounds), 0::numeric) AS lb
           FROM v_forensic_sold_by_tag
          WHERE v_forensic_sold_by_tag.invoice_match = 'NO APEX INVOICE'::text AND NOT v_forensic_sold_by_tag.internal_transfer
        ), cert AS (
         SELECT count(*) AS n
           FROM mv_tag_certificate
          WHERE mv_tag_certificate.certificate_source IS NULL
        )
 SELECT 1 AS ord,
    'IN'::text AS kind,
    'Produced from our own harvests'::text AS line,
    round(( SELECT prod.lb
           FROM prod), 1) AS lb,
    NULL::numeric AS usd,
    'Packages made straight off a harvest, dated on the package''s own PackagedDate'::text AS basis,
    'forensic_reconciliation'::text AS drill
UNION ALL
 SELECT 2 AS ord,
    'IN'::text AS kind,
    'Purchased from third parties'::text AS line,
    round(( SELECT xf.in_lb
           FROM xf), 1) AS lb,
    round(( SELECT spend.usd
           FROM spend), 0) AS usd,
    'Inbound manifests. Cost is the manifests'' own Receiver Wholesale Price — what we actually paid'::text AS basis,
    'third_party_forensic'::text AS drill
UNION ALL
 SELECT 3 AS ord,
    'OUT'::text AS kind,
    'Sold and shipped out'::text AS line,
    round(- (( SELECT xf.out_lb
           FROM xf)), 1) AS lb,
    NULL::numeric AS usd,
    'Outbound manifests where the destination is not one of our licences'::text AS basis,
    'forensic_sold_by_tag'::text AS drill
UNION ALL
 SELECT 4 AS ord,
    'OUT'::text AS kind,
    'Waste, destruction and corrections'::text AS line,
    round(( SELECT adj.lb
           FROM adj), 1) AS lb,
    NULL::numeric AS usd,
    'Metrc adjustment report, weight-denominated rows only'::text AS basis,
    'destroyed_unexplained'::text AS drill
UNION ALL
 SELECT 5 AS ord,
    'RESULT'::text AS kind,
    'Expected on hand'::text AS line,
    round((( SELECT prod.lb
           FROM prod)) + (( SELECT xf.in_lb
           FROM xf)) - (( SELECT xf.out_lb
           FROM xf)) + (( SELECT adj.lb
           FROM adj)), 1) AS lb,
    NULL::numeric AS usd,
    'Everything in, less everything out'::text AS basis,
    'forensic_reconciliation'::text AS drill
UNION ALL
 SELECT 6 AS ord,
    'RESULT'::text AS kind,
    'Counted on hand'::text AS line,
    round(( SELECT oh.lb
           FROM oh), 1) AS lb,
    NULL::numeric AS usd,
    'Every open package in the Metrc mirror'::text AS basis,
    'forensic_position'::text AS drill
UNION ALL
 SELECT 7 AS ord,
    'RESULT'::text AS kind,
    'VARIANCE'::text AS line,
    round((( SELECT oh.lb
           FROM oh)) - ((( SELECT prod.lb
           FROM prod)) + (( SELECT xf.in_lb
           FROM xf)) - (( SELECT xf.out_lb
           FROM xf)) + (( SELECT adj.lb
           FROM adj))), 1) AS lb,
    NULL::numeric AS usd,
    'Expected NEGATIVE — manufacturing yield loss is real and Metrc never tags it'::text AS basis,
    'forensic_reconciliation'::text AS drill
UNION ALL
 SELECT 8 AS ord,
    'MEMO'::text AS kind,
    'Internal MC ↔ MP transfers'::text AS line,
    round(( SELECT xf.internal_lb
           FROM xf), 1) AS lb,
    NULL::numeric AS usd,
    'Our own material between our own licences. Neither a sale nor a purchase'::text AS basis,
    'forensic_sold_by_tag'::text AS drill
UNION ALL
 SELECT 10 AS ord,
    'EXCEPTION'::text AS kind,
    'Third-party UNEXPLAINED'::text AS line,
    round(( SELECT tp.unexplained
           FROM tp), 1) AS lb,
    NULL::numeric AS usd,
    ( SELECT tp.unexplained_tags || ' tags with a manifest and a COA but no recorded outcome'::text
           FROM tp) AS basis,
    'third_party_forensic'::text AS drill
UNION ALL
 SELECT 11 AS ord,
    'EXCEPTION'::text AS kind,
    'Shipped with no Apex invoice'::text AS line,
    round(( SELECT noinv.lb
           FROM noinv), 1) AS lb,
    NULL::numeric AS usd,
    ( SELECT noinv.n || ' outbound lines with no matching invoice. Apex is the record of truth for sales'::text
           FROM noinv) AS basis,
    'forensic_sold_by_tag'::text AS drill
UNION ALL
 SELECT 12 AS ord,
    'EXCEPTION'::text AS kind,
    'Tags with no certificate imported'::text AS line,
    (( SELECT cert.n
           FROM cert))::numeric AS lb,
    NULL::numeric AS usd,
    'Nothing ships without a COA — these are holes in our import, not compliance failures'::text AS basis,
    'tag_coa_gap'::text AS drill
UNION ALL
 SELECT 20 AS ord,
    'THIRD PARTY'::text AS kind,
    'On hand'::text AS line,
    round(( SELECT tp.on_hand
           FROM tp), 1) AS lb,
    NULL::numeric AS usd,
    'Purchased material still in our rooms'::text AS basis,
    'third_party_forensic'::text AS drill
UNION ALL
 SELECT 21 AS ord,
    'THIRD PARTY'::text AS kind,
    'Resold at markup'::text AS line,
    round(( SELECT tp.resold
           FROM tp), 1) AS lb,
    round(( SELECT tp.resold_usd
           FROM tp), 0) AS usd,
    'Traced through the child tag on the outbound manifest'::text AS basis,
    'third_party_forensic'::text AS drill
UNION ALL
 SELECT 22 AS ord,
    'THIRD PARTY'::text AS kind,
    'Failed then remediated'::text AS line,
    round(( SELECT tp.failed
           FROM tp), 1) AS lb,
    NULL::numeric AS usd,
    'Failed material is remediated and processed on. NOT a compliance issue'::text AS basis,
    'third_party_forensic'::text AS drill
  ORDER BY 1;

comment on view v_forensic_audit_panel_live is
  'THE definition of the forensic audit panel. Costs ~9s -- never read this from a page. '
  'Pages read v_forensic_audit_panel, which reads mv_forensic_audit_panel. '
  'This view exists so the matview has a source and so a cached figure can be diffed '
  'against a fresh computation. Agent W, 12 Aug 2026.';;
