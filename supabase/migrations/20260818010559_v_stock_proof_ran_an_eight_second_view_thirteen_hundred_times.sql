/* v_stock_proof ran an eight-second view thirteen hundred times.
 *
 * The Command Center "Dried flower on hand" tile opens v_stock_proof IN PLACE. The view
 * timed out at 20 seconds, so clicking the headline figure on the owner's main dashboard
 * returned nothing at all.
 *
 * MEASURED:
 *   v_stock_packages     1,308 rows   3.9s
 *   v_product_identity  19,585 rows   8.2s to compute ONCE
 *   v_stock_proof                     TIMES OUT
 *
 * Cause: LEFT JOIN LATERAL ( ... FROM v_product_identity WHERE package_tag = s.package_tag
 * LIMIT 1 ) evaluated PER ROW. An eight-second view executed 1,308 times. An N+1 written
 * in SQL, and no index helps because the cost is computing the view itself.
 *
 * FIX: compute v_product_identity ONCE, reduced to one row per tag, join as a set.
 *
 * WHY THE LIMIT 1 WAS THERE, AND WHY IT WAS ALSO A CORRECTNESS BUG.
 * v_product_identity holds 715 duplicate tags — the same cross-licence duplication that
 * made the Metrc "packages mirrored" tile overcount, because a package moving MC -> MP is
 * recorded under both licences. LIMIT 1 with NO ORDER BY picks arbitrarily among them. The
 * columns this join exists to fetch are total_thc, total_cbd, total_terpenes, laboratory
 * and coa_url — the certificate. On a duplicated tag it could therefore return the row
 * WITHOUT the certificate and report no lab result for a package that has one.
 *
 * DISTINCT ON now prefers the row carrying the evidence: coa_url first, then a potency
 * figure, then licence as a stable tie-break. Deterministic, and it answers the question
 * the join was actually asked.
 */

create or replace view public.v_stock_proof as
 WITH identity_one_per_tag AS (
   SELECT DISTINCT ON (pi.package_tag)
          pi.package_tag, pi.total_thc, pi.total_cbd, pi.total_terpenes,
          pi.laboratory, pi.coa_url
     FROM public.v_product_identity pi
    ORDER BY pi.package_tag,
             (pi.coa_url IS NOT NULL) DESC,
             (pi.total_thc IS NOT NULL) DESC,
             pi.license
 )
 SELECT s.package_tag,
    s.item_name,
    s.strain,
    s.stream,
    s.origin,
    s.made_by,
    s.shipped_to_us_by,
    s.license,
    s.location,
    s.days_here,
    s.packaged_on,
    s.quantity,
    s.uom,
    s.pounds,
    s.units,
    s.quantity_shown,
    s.sold_by_weight,
    s.lab_state,
        CASE s.lab_state
            WHEN 'TestPassed'::text THEN 'Sellable now'::text
            WHEN 'RetestPassed'::text THEN 'Sellable now'::text
            WHEN 'TestFailed'::text THEN 'Failed testing'::text
            WHEN 'RetestFailed'::text THEN 'Failed testing'::text
            WHEN 'NotSubmitted'::text THEN 'Never submitted'::text
            ELSE 'At the laboratory'::text
        END AS band,
    f_test_status(s.lab_state, s.submitted_on, s.result_on) AS test_status,
    s.submitted_on AS went_out_for_testing_on,
    s.result_on AS came_back_on,
        CASE
            WHEN s.result_on IS NOT NULL AND s.submitted_on IS NOT NULL THEN s.result_on - s.submitted_on
            WHEN s.submitted_on IS NOT NULL AND (s.lab_state = ANY (ARRAY['SubmittedForTesting'::text, 'TestingInProgress'::text])) THEN CURRENT_DATE - s.submitted_on
            ELSE NULL::integer
        END AS days_at_the_laboratory,
    s.coa_expires AS certificate_valid_to,
    lr.total_thc,
    lr.total_cbd,
    lr.total_terpenes,
    lr.laboratory,
    lr.coa_url,
    f_potency_status(lr.total_thc, lr.total_terpenes, s.lab_state) AS potency_and_certificate,
    s.inbound_manifest,
        CASE
            WHEN s.inbound_manifest IS NULL THEN 'NO MANIFEST — created here from our own harvest or another of our packages, so it never moved '::text || 'between licences. Manifests exist only for material that changed hands.'::text
            ELSE ('Manifest '::text || s.inbound_manifest) || COALESCE(' from '::text || NULLIF(s.shipped_to_us_by, '—'::text), ''::text)
        END AS manifest_proof,
    s.source_harvest,
    s.harvest_cut_on,
    s.dried_in,
    s.harvest_closed_on,
    s.made_from_packages,
    s.production_batch,
    s.traceability,
    f_rate_for(s.stream) AS rate_per_pound_used,
    round(COALESCE(s.pounds, 0::numeric) * f_rate_for(s.stream)) AS value_at_our_rate
   FROM v_stock_packages s
   LEFT JOIN identity_one_per_tag lr ON lr.package_tag = s.package_tag;

comment on view public.v_stock_proof is
  'Per-package proof panel, opened in place by the Command Center dried-flower tile. Fixed '
  '18 Aug 2026: it ran v_product_identity — an 8-second view — once PER ROW through a LEFT '
  'JOIN LATERAL, 1,308 times, and timed out at 20s, so the owner''s main tile opened onto '
  'nothing. Now computed once and joined as a set. The DISTINCT ON also removes a '
  'correctness bug: LIMIT 1 with no ORDER BY picked arbitrarily among 715 cross-licence '
  'duplicate tags and could return the row WITHOUT the certificate for a package that has '
  'one. Agent I.';

grant execute on function public.tg_check_tile_drill() to tg_desktop_reader;;
